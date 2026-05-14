/**
 * Manual "Refresh Metadata" pass.
 *
 * For every work in the library, walks each chapter and parses it once
 * (populating archive_cache) plus warms the visible thumbnails. The lazy path
 * (thumbnail-service generating on first view) is the default; this is the
 * opt-in eager warm — triggered manually from Settings → Cache, or per-work
 * when adding a single title to the library.
 *
 * Throttled, idempotent (skips already-cached items via fast disk/DB checks).
 */

import { createHash } from 'crypto';
import { db } from '../db/client.js';
import { library } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getCached } from './thumbnail-cache.js';
import { getThumbnail, getChapterThumbnail } from './thumbnail-service.js';
import { getDetail, getChapterDetail, getResolvedCoverArtMode, coverArtModeToOffset } from '../sources/manager.js';
import { markWorkScanning, markWorkScanned } from '../sources/scan-status.js';

const WARM_CONCURRENCY = 4;

function urlHash(url: string): string {
	return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

interface WarmStats {
	worksScanned: number;
	thumbsWarmed: number;
	skipped: number;
	errors: number;
}

/** Pre-cache the thumbnails + per-chapter detail for a single work. */
export async function warmWorkArtwork(
	sourceId: string,
	workId: string,
	fallbackTitle?: string,
): Promise<{ warmed: number; skipped: number; errors: number }> {
	let warmed = 0;
	let skipped = 0;
	let errors = 0;

	markWorkScanning(sourceId, workId);
	try {
		let detail: Awaited<ReturnType<typeof getDetail>>;
		try {
			detail = await getDetail(sourceId, workId, fallbackTitle);
		} catch {
			return { warmed: 0, skipped: 0, errors: 1 };
		}

		// 1. Warm work-level thumbnails (cover + banner). These are skipped via
		//    fast disk-cache existence check so re-runs are free.
		const workThumbUrls: string[] = [];
		if (detail.work.coverUrl) workThumbUrls.push(detail.work.coverUrl);
		if (detail.work.bannerUrl) workThumbUrls.push(detail.work.bannerUrl);

		for (const url of workThumbUrls) {
			const hash = urlHash(url);
			if (await getCached(sourceId, workId, hash)) { skipped++; continue; }
			try { await getThumbnail(url, sourceId, workId); warmed++; }
			catch { errors++; }
		}

		// 2. Walk each chapter — parse archive (populates archive_cache) AND
		//    generate the chapter cover thumbnail so the chapter grid renders
		//    instantly on first view. This is the "Plex parity" half: after a
		//    Refresh Metadata pass, browsing any work in the library is
		//    completely uncached-cold-free.
		const coverArtMode = getResolvedCoverArtMode(sourceId, workId);
		const coverPageOffset = coverArtModeToOffset(coverArtMode);

		for (const chapter of detail.chapters) {
			try {
				await getChapterDetail(sourceId, chapter.id);
			} catch {
				errors++;
				continue;
			}

			if (coverPageOffset >= 0) {
				try {
					await getChapterThumbnail(sourceId, workId, chapter.id, coverPageOffset);
					warmed++;
				} catch {
					errors++;
				}
			}
		}

		return { warmed, skipped, errors };
	} finally {
		markWorkScanned(sourceId, workId);
	}
}

/**
 * Walk every library item and warm its artwork.
 *
 * Runs concurrently up to WARM_CONCURRENCY at a time. Logs final stats so the
 * NAS log shows the warmer doing its job.
 */
export async function warmAllLibrary(): Promise<WarmStats> {
	const items = db
		.select({
			sourceId: library.sourceId,
			workId: library.workId,
			title: library.title,
		})
		.from(library)
		.all();

	const stats: WarmStats = { worksScanned: 0, thumbsWarmed: 0, skipped: 0, errors: 0 };
	if (items.length === 0) {
		console.log('[warmer] no library items to warm');
		return stats;
	}

	console.log(`[warmer] starting cache warm for ${items.length} items (concurrency ${WARM_CONCURRENCY})`);
	const startedAt = Date.now();

	let cursor = 0;
	async function worker() {
		while (cursor < items.length) {
			const i = cursor++;
			const item = items[i];
			const result = await warmWorkArtwork(item.sourceId, item.workId, item.title);
			stats.worksScanned++;
			stats.thumbsWarmed += result.warmed;
			stats.skipped += result.skipped;
			stats.errors += result.errors;
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(WARM_CONCURRENCY, items.length) }, () => worker()),
	);

	const elapsedMs = Date.now() - startedAt;
	console.log(
		`[warmer] done in ${elapsedMs}ms — works=${stats.worksScanned} warmed=${stats.thumbsWarmed} skipped=${stats.skipped} errors=${stats.errors}`,
	);
	return stats;
}

/** Warm only the works belonging to a specific source. Used after a scan. */
export async function warmSource(sourceId: string): Promise<WarmStats> {
	const items = db
		.select({
			sourceId: library.sourceId,
			workId: library.workId,
			title: library.title,
		})
		.from(library)
		.where(eq(library.sourceId, sourceId))
		.all();

	const stats: WarmStats = { worksScanned: 0, thumbsWarmed: 0, skipped: 0, errors: 0 };
	if (items.length === 0) return stats;

	console.log(`[warmer] warming ${items.length} items for ${sourceId}`);
	const startedAt = Date.now();

	let cursor = 0;
	async function worker() {
		while (cursor < items.length) {
			const i = cursor++;
			const item = items[i];
			const result = await warmWorkArtwork(item.sourceId, item.workId, item.title);
			stats.worksScanned++;
			stats.thumbsWarmed += result.warmed;
			stats.skipped += result.skipped;
			stats.errors += result.errors;
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(WARM_CONCURRENCY, items.length) }, () => worker()),
	);

	console.log(
		`[warmer] ${sourceId} done in ${Date.now() - startedAt}ms — works=${stats.worksScanned} warmed=${stats.thumbsWarmed} skipped=${stats.skipped} errors=${stats.errors}`,
	);
	return stats;
}

// Single in-flight all-library warm so repeat triggers don't pile up.
let inFlight: Promise<WarmStats> | null = null;

/** Trigger an all-library warm pass. If one is running, returns the running promise. */
export function triggerWarmAll(): Promise<WarmStats> {
	if (inFlight) return inFlight;
	inFlight = warmAllLibrary().finally(() => { inFlight = null; });
	return inFlight;
}
