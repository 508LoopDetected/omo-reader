/**
 * Thumbnail service — orchestrates cache lookup, image resolution, and optional sharp resizing.
 *
 * Sharp is loaded lazily and is optional. When unavailable, serves the original
 * full-size image instead of a resized thumbnail.
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
		console.warn('[thumbnail-service] sharp unavailable — thumbnails will be served full-size without caching');
	}
	return _sharp;
}

function urlHash(url: string): string {
	return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

type ThumbResult = { data: Buffer; contentType: string };

const inflight = new Map<string, Promise<ThumbResult>>();

export async function getThumbnail(
	url: string,
	sourceId: string = '_unsorted',
	workId: string = '_unknown',
	signal?: AbortSignal,
): Promise<ThumbResult> {
	const hash = urlHash(url);
	const key = `${sourceId}\0${workId}\0${hash}`;

	const existing = inflight.get(key);
	if (existing) return existing;

	const work = produceThumbnail(url, sourceId, workId, hash, signal);
	inflight.set(key, work);
	work.finally(() => {
		if (inflight.get(key) === work) inflight.delete(key);
	}).catch(() => {});
	return work;
}

async function produceThumbnail(
	url: string,
	sourceId: string,
	workId: string,
	hash: string,
	signal: AbortSignal | undefined,
): Promise<ThumbResult> {
	const cached = await getCached(sourceId, workId, hash);
	if (cached) {
		return { data: cached, contentType: 'image/webp' };
	}

	const original = await resolveImageUrl(url, signal);

	const sharp = await getSharp();
	if (sharp) {
		const resized = await sharp(original.data)
			.resize({ width: 300 })
			.webp({ quality: 80 })
			.toBuffer();
		putCached(sourceId, workId, hash, resized).catch((err) => {
			console.warn(`[thumbnail-service] cache write failed for ${sourceId}/${workId}/${hash}:`, err);
		});
		return { data: resized, contentType: 'image/webp' };
	}

	// Sharp missing: serve original uncached. Caching here would poison the cache with full-size
	// images stored under .webp filenames that a later sharp install would still hit.
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
