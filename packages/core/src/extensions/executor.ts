/**
 * Extension executor — calls extension methods and maps results
 * to our app's internal types (WorkEntry, Chapter, Page).
 */

import { createExtensionRuntime, type ExtensionSourceMeta, type ExtensionInstance } from './runtime.js';
import type { WorkEntry, Chapter, Page, PaginatedResult } from '../types/work.js';

// Cache runtime instances per source to avoid re-evaluating JS on every request
const runtimeCache = new Map<string, ExtensionInstance>();

// Cache titles from browse/search so getDetail can use them
// (many extensions don't return name from getDetail, expecting the framework to merge)
const titleCache = new Map<string, string>();

const STATUS_MAP: Record<number, WorkEntry['status']> = {
	0: 'ongoing',
	1: 'completed',
	2: 'hiatus',
	3: 'cancelled',
	4: 'completed', // publishingFinished
	5: 'unknown',
};

export function getOrCreateRuntime(
	sourceId: string,
	jsCode: string,
	meta: ExtensionSourceMeta,
): ExtensionInstance {
	let instance = runtimeCache.get(sourceId);
	if (!instance) {
		instance = createExtensionRuntime(jsCode, meta);
		runtimeCache.set(sourceId, instance);
	}
	return instance;
}

export function clearRuntimeCache(sourceId?: string): void {
	if (sourceId) {
		runtimeCache.delete(sourceId);
	} else {
		runtimeCache.clear();
	}
}

interface RawMangaItem {
	name?: string;
	imageUrl?: string;
	link?: string;
}

interface RawMPages {
	list?: RawMangaItem[];
	hasNextPage?: boolean;
}

interface RawChapter {
	name?: string;
	url?: string;
	dateUpload?: string | number;
	scanlator?: string;
}

interface RawMManga {
	name?: string;
	title?: string;
	imageUrl?: string;
	description?: string;
	author?: string;
	artist?: string;
	status?: number;
	genre?: string[];
	chapters?: RawChapter[];
}

const NSFW_GENRES = new Set([
	'adult', 'hentai', 'smut', 'pornographic', 'mature', 'erotica', '18+', 'explicit',
]);

function isNsfwByGenres(genres?: string[]): boolean {
	if (!genres) return false;
	return genres.some((g) => NSFW_GENRES.has(g.toLowerCase()));
}

function encodeId(value: string): string {
	return Buffer.from(value).toString('base64url');
}

export async function extGetPopular(
	runtime: ExtensionInstance,
	sourceId: string,
	page: number,
): Promise<PaginatedResult<WorkEntry>> {
	const raw = await runtime.getPopular(page) as RawMPages;
	return mapMPages(raw, sourceId, page);
}

export async function extGetLatest(
	runtime: ExtensionInstance,
	sourceId: string,
	page: number,
): Promise<PaginatedResult<WorkEntry>> {
	const raw = await runtime.getLatestUpdates(page) as RawMPages;
	return mapMPages(raw, sourceId, page);
}

export async function extSearch(
	runtime: ExtensionInstance,
	sourceId: string,
	query: string,
	page: number,
	filters: unknown[] = [],
): Promise<PaginatedResult<WorkEntry>> {
	const raw = await runtime.search(query, page, filters) as RawMPages;
	return mapMPages(raw, sourceId, page);
}

export async function extGetDetail(
	runtime: ExtensionInstance,
	sourceId: string,
	workUrl: string,
	fallbackTitle?: string,
): Promise<{ work: WorkEntry; chapters: Chapter[] }> {
	const raw = await runtime.getDetail(workUrl) as RawMManga;
	const workId = encodeId(workUrl);

	const work: WorkEntry = {
		id: workId,
		sourceId,
		title: raw.name || raw.title || titleCache.get(workId) || fallbackTitle || 'Unknown',
		coverUrl: raw.imageUrl ? proxyUrl(raw.imageUrl) : undefined,
		url: workUrl,
		author: raw.author,
		artist: raw.artist,
		description: raw.description,
		genres: raw.genre,
		status: STATUS_MAP[raw.status ?? 5] ?? 'unknown',
		nsfw: isNsfwByGenres(raw.genre),
	};

	const chapters: Chapter[] = (raw.chapters ?? []).map((ch, idx) => ({
		id: encodeId(ch.url ?? `chapter-${idx}`),
		workId,
		sourceId,
		title: ch.name ?? `Chapter ${idx + 1}`,
		chapterNumber: extractChapterNumber(ch.name),
		url: ch.url ?? '',
		dateUploaded: ch.dateUpload ? parseInt(String(ch.dateUpload)) : undefined,
		scanlator: ch.scanlator,
	}));

	return { work, chapters };
}

export async function extGetPageList(
	runtime: ExtensionInstance,
	chapterUrl: string,
	sourceBaseUrl: string,
): Promise<Page[]> {
	const raw = await runtime.getPageList(chapterUrl) as (string | { url: string; headers?: Record<string, string> })[];

	if (!Array.isArray(raw)) return [];

	return raw.map((item, index) => {
		let imageUrl: string;
		let headers: Record<string, string> | undefined;

		if (typeof item === 'string') {
			imageUrl = item;
		} else {
			imageUrl = item.url;
			headers = item.headers;
		}

		// Build proxy URL with optional referer
		const proxyParams = new URLSearchParams({ url: imageUrl });
		if (headers?.Referer || headers?.referer) {
			proxyParams.set('referer', headers.Referer || headers.referer);
		} else if (sourceBaseUrl) {
			proxyParams.set('referer', sourceBaseUrl);
		}

		return {
			index,
			url: `/api/proxy/image?${proxyParams.toString()}`,
		};
	});
}

function mapMPages(raw: RawMPages, sourceId: string, page: number): PaginatedResult<WorkEntry> {
	const list = raw?.list ?? [];
	const items = list.map((item) => {
		const id = encodeId(item.link ?? '');
		const title = item.name ?? 'Unknown';
		// Cache title so getDetail can use it as fallback
		if (item.name) titleCache.set(id, item.name);
		return {
			id,
			sourceId,
			title,
			coverUrl: item.imageUrl ? proxyUrl(item.imageUrl) : undefined,
			url: item.link ?? '',
		};
	});
	return { items, hasNextPage: raw?.hasNextPage ?? false, page };
}

function proxyUrl(url: string): string {
	return `/api/proxy/image?url=${encodeURIComponent(url)}`;
}

function extractChapterNumber(name?: string): number | undefined {
	if (!name) return undefined;
	const match = name.match(/(?:chapter|ch\.?)\s*([\d.]+)/i);
	if (match) return parseFloat(match[1]);
	const numMatch = name.match(/^([\d.]+)$/);
	if (numMatch) return parseFloat(numMatch[1]);
	return undefined;
}
