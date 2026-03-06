/**
 * Disk-based thumbnail cache.
 *
 * Default location: ~/.cache/omo-reader/thumbnails/
 * Configurable via setCacheDir() (called by initialize() in init.ts).
 *
 * Structure: CACHE_DIR/{sourceId}/{workId}/{urlHash}.webp
 * Expendable — auto-recreated on cache miss.
 */

import { readFile, writeFile, mkdir, rm, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

let CACHE_DIR = join(homedir(), '.cache', 'omo-reader', 'thumbnails');

/** Override the thumbnail cache directory. Called by initialize(). */
export function setCacheDir(dir: string): void {
	CACHE_DIR = dir;
}

/** Return the current cache directory path. */
export function getCacheDir(): string {
	return CACHE_DIR;
}

interface CacheStats {
	count: number;
	bytes: number;
}

function safeName(s: string): string {
	return encodeURIComponent(s);
}

function cachePath(sourceId: string, workId: string, urlHash: string): string {
	return join(CACHE_DIR, safeName(sourceId), safeName(workId), `${urlHash}.webp`);
}

function titleDir(sourceId: string, workId: string): string {
	return join(CACHE_DIR, safeName(sourceId), safeName(workId));
}

function sourceDir(sourceId: string): string {
	return join(CACHE_DIR, safeName(sourceId));
}

export async function getCached(sourceId: string, workId: string, urlHash: string): Promise<Buffer | null> {
	try {
		return await readFile(cachePath(sourceId, workId, urlHash));
	} catch {
		return null;
	}
}

export async function putCached(sourceId: string, workId: string, urlHash: string, data: Buffer): Promise<void> {
	const dir = titleDir(sourceId, workId);
	await mkdir(dir, { recursive: true });
	await writeFile(cachePath(sourceId, workId, urlHash), data);
}

export async function clearForTitle(sourceId: string, workId: string): Promise<CacheStats> {
	const dir = titleDir(sourceId, workId);
	const stats = await walkStats(dir);
	try {
		await rm(dir, { recursive: true, force: true });
	} catch { /* already gone */ }
	return stats;
}

export async function clearForSource(sourceId: string): Promise<CacheStats> {
	const dir = sourceDir(sourceId);
	const stats = await walkStats(dir);
	try {
		await rm(dir, { recursive: true, force: true });
	} catch { /* already gone */ }
	return stats;
}

export async function clearAll(): Promise<CacheStats> {
	const stats = await walkStats(CACHE_DIR);
	try {
		await rm(CACHE_DIR, { recursive: true, force: true });
	} catch { /* already gone */ }
	return stats;
}

export async function getStats(): Promise<{ totalSize: number; totalCount: number }> {
	const s = await walkStats(CACHE_DIR);
	return { totalSize: s.bytes, totalCount: s.count };
}

async function walkStats(dir: string): Promise<CacheStats> {
	let count = 0;
	let bytes = 0;
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				const sub = await walkStats(fullPath);
				bytes += sub.bytes;
				count += sub.count;
			} else if (entry.isFile() && entry.name.endsWith('.webp')) {
				const s = await stat(fullPath);
				bytes += s.size;
				count++;
			}
		}
	} catch { /* dir doesn't exist */ }
	return { count, bytes };
}
