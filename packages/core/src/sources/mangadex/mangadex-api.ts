/**
 * MangaDex API v5 client — raw fetch wrappers with rate limiting.
 */

import { RateLimiter } from '../rate-limiter.js';
import type {
	MangaDexManga,
	MangaDexChapter,
	MangaDexPaginatedResponse,
	MangaDexEntityResponse,
	MangaDexAtHomeResponse,
} from './mangadex-types.js';
import type { NsfwMode } from '../settings.js';

const BASE_URL = 'https://api.mangadex.org';

// Rate limiters per MangaDex docs: 5 req/sec general, 40 req/min at-home
const apiLimiter = new RateLimiter(5, 1000);
const atHomeLimiter = new RateLimiter(40, 60000);

// Cache at-home server responses (10min TTL)
const atHomeCache = new Map<string, { data: MangaDexAtHomeResponse; expiresAt: number }>();

const COMMON_INCLUDES = 'includes[]=cover_art&includes[]=author&includes[]=artist';

// Default: safe + suggestive only (matches Tachiyomi/Mangayomi behavior)
const CONTENT_RATING_SFW = 'contentRating[]=safe&contentRating[]=suggestive';
// NSFW only: erotica + pornographic
const CONTENT_RATING_NSFW = 'contentRating[]=erotica&contentRating[]=pornographic';
// All ratings combined
const CONTENT_RATING_ALL = 'contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic';

function contentRating(mode: NsfwMode): string {
	if (mode === 'nsfw') return CONTENT_RATING_NSFW;
	if (mode === 'all') return CONTENT_RATING_ALL;
	return CONTENT_RATING_SFW;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [300, 800, 2000];
const FETCH_TIMEOUT_MS = 15_000;

function isRetryable(err: unknown): boolean {
	if (err instanceof DOMException && err.name === 'TimeoutError') return true;
	if (err instanceof DOMException && err.name === 'AbortError') return true;
	if (err instanceof TypeError && (err as NodeJS.ErrnoException).cause) {
		const cause = (err as NodeJS.ErrnoException).cause as { code?: string };
		if (cause.code === 'UND_ERR_SOCKET' || cause.code === 'ECONNRESET' || cause.code === 'ETIMEDOUT') {
			return true;
		}
	}
	return false;
}

async function apiFetch<T>(path: string, limiter: RateLimiter = apiLimiter, signal?: AbortSignal): Promise<T> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		await limiter.acquire(signal);
		try {
			const fetchSignal = signal
				? AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)])
				: AbortSignal.timeout(FETCH_TIMEOUT_MS);
			const res = await fetch(`${BASE_URL}${path}`, {
				headers: { 'User-Agent': 'omo-reader/1.0' },
				signal: fetchSignal,
			});
			if (res.status === 429) {
				const retryAfter = parseInt(res.headers.get('retry-after') ?? '2') * 1000;
				await new Promise((r) => setTimeout(r, retryAfter));
				continue;
			}
			if (!res.ok) {
				throw new Error(`MangaDex API error ${res.status}: ${res.statusText} for ${path}`);
			}
			return res.json() as Promise<T>;
		} catch (err) {
			lastError = err;
			if (attempt < MAX_RETRIES && isRetryable(err)) {
				await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
				continue;
			}
			throw err;
		}
	}

	throw lastError;
}

export async function searchManga(
	query: string,
	limit: number = 20,
	offset: number = 0,
	nsfwMode: NsfwMode = 'sfw',
): Promise<MangaDexPaginatedResponse<MangaDexManga>> {
	const params = new URLSearchParams({
		title: query,
		limit: String(limit),
		offset: String(offset),
		'order[relevance]': 'desc',
	});
	return apiFetch(`/manga?${params}&${COMMON_INCLUDES}&${contentRating(nsfwMode)}`);
}

export async function getPopular(
	limit: number = 20,
	offset: number = 0,
	nsfwMode: NsfwMode = 'sfw',
): Promise<MangaDexPaginatedResponse<MangaDexManga>> {
	const params = new URLSearchParams({
		limit: String(limit),
		offset: String(offset),
		'order[followedCount]': 'desc',
	});
	return apiFetch(`/manga?${params}&${COMMON_INCLUDES}&${contentRating(nsfwMode)}`);
}

export async function getLatest(
	limit: number = 20,
	offset: number = 0,
	nsfwMode: NsfwMode = 'sfw',
): Promise<MangaDexPaginatedResponse<MangaDexManga>> {
	const params = new URLSearchParams({
		limit: String(limit),
		offset: String(offset),
		'order[latestUploadedChapter]': 'desc',
	});
	return apiFetch(`/manga?${params}&${COMMON_INCLUDES}&${contentRating(nsfwMode)}`);
}

export async function getMangaById(
	id: string,
): Promise<MangaDexEntityResponse<MangaDexManga>> {
	// Single manga lookup always includes all ratings — the user navigated here directly
	return apiFetch(`/manga/${id}?${COMMON_INCLUDES}&${CONTENT_RATING_ALL}`);
}

export async function getMangaFeed(
	mangaId: string,
	limit: number = 500,
	offset: number = 0,
): Promise<MangaDexPaginatedResponse<MangaDexChapter>> {
	const params = new URLSearchParams({
		'translatedLanguage[]': 'en',
		limit: String(limit),
		offset: String(offset),
		'order[chapter]': 'asc',
		'includes[]': 'scanlation_group',
	});
	return apiFetch(`/manga/${mangaId}/feed?${params}`);
}

export async function getAtHomeServer(
	chapterId: string,
	signal?: AbortSignal,
): Promise<MangaDexAtHomeResponse> {
	const cached = atHomeCache.get(chapterId);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.data;
	}

	const data = await apiFetch<MangaDexAtHomeResponse>(
		`/at-home/server/${chapterId}`,
		atHomeLimiter,
		signal,
	);

	atHomeCache.set(chapterId, { data, expiresAt: Date.now() + 10 * 60 * 1000 });
	return data;
}

export function clearAtHomeCache(): void {
	atHomeCache.clear();
}
