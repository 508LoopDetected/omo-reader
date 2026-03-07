/**
 * Thumbnail service — orchestrates cache lookup, image resolution, and optional sharp resizing.
 *
 * Sharp is loaded lazily and is optional. When unavailable (e.g., compiled TUI binary),
 * serves the original full-size image instead of a resized thumbnail.
 */

import { createHash } from 'crypto';
import { getCached, putCached } from './thumbnail-cache.js';
import { resolveImageUrl } from './image-resolver.js';
import { getChapterPages } from '../sources/manager.js';

// Lazy-load sharp — optional dependency
let _sharp: ((input: Buffer) => { resize: (opts: { width: number }) => { webp: (opts: { quality: number }) => { toBuffer: () => Promise<Buffer> } } }) | null | undefined;

async function getSharp(): Promise<typeof _sharp> {
	if (_sharp !== undefined) return _sharp;
	try {
		const mod = await import('sharp');
		_sharp = mod.default;
	} catch {
		_sharp = null;
	}
	return _sharp;
}

function urlHash(url: string): string {
	return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export async function getThumbnail(
	url: string,
	sourceId: string = '_unsorted',
	workId: string = '_unknown',
	signal?: AbortSignal,
): Promise<{ data: Buffer; contentType: string }> {
	const hash = urlHash(url);

	// Check disk cache
	const cached = await getCached(sourceId, workId, hash);
	if (cached) {
		return { data: cached, contentType: 'image/webp' };
	}

	// Resolve original image
	const original = await resolveImageUrl(url, signal);

	// Resize to thumbnail if sharp is available
	const sharp = await getSharp();
	if (sharp) {
		const resized = await sharp(original.data)
			.resize({ width: 300 })
			.webp({ quality: 80 })
			.toBuffer();

		// Write to cache (fire and forget)
		putCached(sourceId, workId, hash, resized).catch(() => {});

		return { data: resized, contentType: 'image/webp' };
	}

	// Fallback: cache and serve full-size original image
	putCached(sourceId, workId, hash, original.data).catch(() => {});
	return { data: original.data, contentType: original.contentType };
}

export async function getChapterThumbnail(
	sourceId: string,
	workId: string,
	chapterId: string,
	offset: number,
	signal?: AbortSignal,
): Promise<{ data: Buffer; contentType: string }> {
	const pages = await getChapterPages(sourceId, chapterId, signal);
	if (pages.length === 0) {
		throw new Error('Chapter has no pages');
	}
	const index = Math.min(Math.max(0, offset), pages.length - 1);
	const pageUrl = pages[index].url;
	return getThumbnail(pageUrl, sourceId, workId, signal);
}
