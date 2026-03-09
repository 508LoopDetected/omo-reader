/**
 * Comic Vine REST API client — western comics metadata search and detail.
 * Requires user-provided API key. Rate limit: ~3 req/sec to be safe.
 */

import { RateLimiter } from '../sources/rate-limiter.js';
import type { ComicVineVolume, ComicVineSearchResponse, ComicVineDetailResponse } from './comicvine-types.js';
import type { MetadataSearchResult } from './metadata-types.js';

const BASE_URL = 'https://comicvine.gamespot.com/api';
const limiter = new RateLimiter(3, 1000);

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [300, 800, 2000];

function isRetryable(err: unknown): boolean {
	if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) return true;
	if (err instanceof TypeError && (err as NodeJS.ErrnoException).cause) {
		const cause = (err as NodeJS.ErrnoException).cause as { code?: string };
		if (cause.code === 'UND_ERR_SOCKET' || cause.code === 'ECONNRESET' || cause.code === 'ETIMEDOUT') return true;
	}
	return false;
}

async function apiFetch<T>(path: string, apiKey: string, signal?: AbortSignal): Promise<T> {
	let lastError: unknown;
	const sep = path.includes('?') ? '&' : '?';
	const url = `${BASE_URL}${path}${sep}api_key=${apiKey}&format=json`;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		await limiter.acquire(signal);
		try {
			const fetchSignal = signal
				? AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)])
				: AbortSignal.timeout(FETCH_TIMEOUT_MS);
			const res = await fetch(url, {
				headers: { 'User-Agent': 'omo-reader/1.0' },
				signal: fetchSignal,
			});
			if (res.status === 429) {
				await new Promise((r) => setTimeout(r, 2000));
				continue;
			}
			if (!res.ok) throw new Error(`Comic Vine API error ${res.status}: ${res.statusText}`);
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

function stripHtml(html: string | null): string | null {
	if (!html) return null;
	return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() || null;
}

function volumeToSearchResult(vol: ComicVineVolume): MetadataSearchResult {
	const aliases = vol.aliases
		? vol.aliases.split('\n').map((a) => a.trim()).filter(Boolean)
		: [];
	return {
		providerId: String(vol.id),
		title: vol.name,
		altTitles: aliases,
		year: vol.start_year ? parseInt(vol.start_year) || null : null,
		coverUrl: vol.image?.medium_url ?? vol.image?.original_url ?? null,
		description: stripHtml(vol.deck ?? vol.description),
		status: null, // Comic Vine doesn't reliably provide series status
	};
}

/** Search Comic Vine for volumes matching a title. Requires API key. */
export async function searchComicVine(query: string, apiKey: string, perPage = 10, signal?: AbortSignal): Promise<MetadataSearchResult[]> {
	const encoded = encodeURIComponent(query);
	const res = await apiFetch<ComicVineSearchResponse>(
		`/search/?resources=volume&query=${encoded}&limit=${perPage}`,
		apiKey,
		signal,
	);
	if (res.error !== 'OK') throw new Error(`Comic Vine search error: ${res.error}`);
	return res.results.map(volumeToSearchResult);
}

/** Fetch full detail for a Comic Vine volume by ID. Requires API key. */
export async function getComicVineDetail(volumeId: number, apiKey: string, signal?: AbortSignal): Promise<{
	result: MetadataSearchResult;
	volume: ComicVineVolume;
	publisher: string | null;
	communityScore: null;
	externalUrl: string | null;
}> {
	const res = await apiFetch<ComicVineDetailResponse>(
		`/volume/4050-${volumeId}/`,
		apiKey,
		signal,
	);
	if (res.error !== 'OK') throw new Error(`Comic Vine detail error: ${res.error}`);
	const vol = res.results;
	return {
		result: volumeToSearchResult(vol),
		volume: vol,
		publisher: vol.publisher?.name ?? null,
		communityScore: null,
		externalUrl: vol.site_detail_url ?? null,
	};
}
