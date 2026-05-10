/**
 * Per-archive parse cache (page list + ComicInfo metadata), keyed by mtime.
 *
 * The scanner used to read each .cbz from disk on every getDetail call just to
 * list page filenames and parse ComicInfo.xml. For a series like Knuckles the
 * Echidna (~30 issues) that's hundreds of MB of disk reads on every chapter
 * grid render — the dominant source of work-detail latency.
 *
 * Now: stat the archive (microseconds). If mtime matches the cached row, reuse
 * the parsed data. Otherwise read+parse once, persist, return. Subsequent
 * scans of an unchanged archive skip the read entirely.
 */

import { db } from '../db/client.js';
import { archiveCache } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { listArchivePagesFromBuffer } from '../archive.js';
import { extractComicInfoFromBuffer } from './local/comicinfo-parser.js';
import type { ComicInfoData } from './local/comicinfo-parser.js';
import type { FsAdapter } from './fs-adapter.js';

export interface ArchiveData {
	pages: string[];
	metadata: ComicInfoData | null;
}

/** In-flight reads coalesced so concurrent warmers don't double-read the same archive. */
const inFlight = new Map<string, Promise<ArchiveData>>();

function cacheKey(sourceId: string, path: string): string {
	return `${sourceId}\x1f${path}`;
}

function readCached(sourceId: string, path: string, mtimeMs: number): ArchiveData | null {
	const row = db.select()
		.from(archiveCache)
		.where(and(eq(archiveCache.sourceId, sourceId), eq(archiveCache.filePath, path)))
		.get();
	if (!row) return null;
	if (row.mtimeMs !== mtimeMs) return null;
	try {
		return {
			pages: JSON.parse(row.pagesJson) as string[],
			metadata: row.metadataJson ? (JSON.parse(row.metadataJson) as ComicInfoData) : null,
		};
	} catch {
		return null;
	}
}

function writeCached(sourceId: string, path: string, mtimeMs: number, data: ArchiveData): void {
	const pagesJson = JSON.stringify(data.pages);
	const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;

	// SQLite UPSERT — replace any stale row for this (sourceId, path).
	const existing = db.select({ filePath: archiveCache.filePath })
		.from(archiveCache)
		.where(and(eq(archiveCache.sourceId, sourceId), eq(archiveCache.filePath, path)))
		.get();

	if (existing) {
		db.update(archiveCache)
			.set({ mtimeMs, pagesJson, metadataJson })
			.where(and(eq(archiveCache.sourceId, sourceId), eq(archiveCache.filePath, path)))
			.run();
	} else {
		db.insert(archiveCache)
			.values({ sourceId, filePath: path, mtimeMs, pagesJson, metadataJson })
			.run();
	}
}

async function parseArchive(fs: FsAdapter, path: string): Promise<ArchiveData> {
	const buffer = await fs.readFile(path);
	const pages = await listArchivePagesFromBuffer(buffer);
	let metadata: ComicInfoData | null = null;
	try {
		metadata = await extractComicInfoFromBuffer(buffer);
	} catch { /* archive without ComicInfo — fine */ }
	return { pages, metadata };
}

/**
 * Get parsed page list + metadata for an archive. Uses the disk-backed cache
 * unless the file's mtime has changed (or the FsAdapter doesn't support mtime,
 * in which case every call re-parses — only matters for SMB).
 */
export async function loadArchiveData(
	fs: FsAdapter,
	sourceId: string,
	path: string,
): Promise<ArchiveData> {
	const mtimeMs = await fs.getMtimeMs(path);

	if (mtimeMs !== undefined) {
		const cached = readCached(sourceId, path, mtimeMs);
		if (cached) return cached;
	}

	const key = cacheKey(sourceId, path);
	const pending = inFlight.get(key);
	if (pending) return pending;

	const promise = (async () => {
		try {
			const data = await parseArchive(fs, path);
			if (mtimeMs !== undefined) {
				try { writeCached(sourceId, path, mtimeMs, data); } catch { /* swallow */ }
			}
			return data;
		} finally {
			inFlight.delete(key);
		}
	})();

	inFlight.set(key, promise);
	return promise;
}
