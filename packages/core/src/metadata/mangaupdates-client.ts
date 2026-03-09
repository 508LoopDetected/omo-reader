/**
 * MangaUpdates REST API client — manga metadata search and detail.
 * No API key required. Rate limit: ~5 req/sec to be safe.
 */

import { RateLimiter } from '../sources/rate-limiter.js';
import type { MUSeries, MUSearchResponse } from './mangaupdates-types.js';
import type { MetadataSearchResult } from './metadata-types.js';

const BASE_URL = 'https://api.mangaupdates.com/v1';
const limiter = new RateLimiter(5, 1000);

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

async function apiFetch<T>(path: string, options: RequestInit = {}, signal?: AbortSignal): Promise<T> {
	let lastError: unknown;
	const url = `${BASE_URL}${path}`;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		await limiter.acquire(signal);
		try {
			const fetchSignal = signal
				? AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)])
				: AbortSignal.timeout(FETCH_TIMEOUT_MS);
			const res = await fetch(url, {
				headers: { 'Content-Type': 'application/json' },
				signal: fetchSignal,
				...options,
			});
			if (res.status === 429) {
				await new Promise((r) => setTimeout(r, 2000));
				continue;
			}
			if (!res.ok) throw new Error(`MangaUpdates API error ${res.status}: ${res.statusText}`);
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

/** Parse the status string like "72 Volumes (Complete)" into a normalized status. */
function parseStatus(status: string | null, completed: boolean | null): string | null {
	if (completed) return 'completed';
	if (!status) return null;
	const lower = status.toLowerCase();
	if (lower.includes('complete')) return 'completed';
	if (lower.includes('hiatus')) return 'hiatus';
	if (lower.includes('cancelled') || lower.includes('canceled')) return 'cancelled';
	// If not complete and has content, it's ongoing
	if (status.trim()) return 'ongoing';
	return null;
}

function seriesToSearchResult(series: { series_id: number; title: string; description: string | null; image: { url: { original: string | null; thumb: string | null } } | null; year: string | null; genres: { genre: string }[] }, status?: string | null): MetadataSearchResult {
	return {
		providerId: String(series.series_id),
		title: series.title,
		altTitles: [],
		year: series.year ? parseInt(series.year) || null : null,
		coverUrl: series.image?.url?.original ?? series.image?.url?.thumb ?? null,
		description: stripHtml(series.description),
		status: status ?? null,
	};
}

/** Search MangaUpdates for manga matching a title. */
export async function searchMangaUpdates(query: string, perPage = 10, signal?: AbortSignal): Promise<MetadataSearchResult[]> {
	const res = await apiFetch<MUSearchResponse>(
		'/series/search',
		{
			method: 'POST',
			body: JSON.stringify({ search: query, per_page: perPage }),
		},
		signal,
	);
	return res.results.map((r) => seriesToSearchResult(r.record));
}

/** Fetch full detail for a MangaUpdates series by ID. */
export async function getMangaUpdatesDetail(seriesId: number, signal?: AbortSignal): Promise<{
	result: MetadataSearchResult;
	series: MUSeries;
	author: string | null;
	artist: string | null;
	publishers: string[];
	communityScore: number | null;
	externalUrl: string | null;
}> {
	const series = await apiFetch<MUSeries>(`/series/${seriesId}`, {}, signal);

	const result: MetadataSearchResult = {
		providerId: String(series.series_id),
		title: series.title,
		altTitles: series.associated?.map((a) => a.title) ?? [],
		year: series.year ? parseInt(series.year) || null : null,
		coverUrl: series.image?.url?.original ?? series.image?.url?.thumb ?? null,
		description: stripHtml(series.description),
		status: parseStatus(series.status, series.completed),
	};

	let author: string | null = null;
	let artist: string | null = null;
	for (const a of series.authors ?? []) {
		if (a.type === 'Author' && !author) author = a.name;
		if (a.type === 'Artist' && !artist) artist = a.name;
	}
	// If only one author entry with no type distinction, use for both
	if (!author && !artist && series.authors?.length) {
		author = series.authors[0].name;
	}

	const publishers = (series.publishers ?? []).map((p) => p.publisher_name);

	return {
		result,
		series,
		author,
		artist,
		publishers,
		communityScore: series.bayesian_rating ? series.bayesian_rating * 10 : null, // normalize to 0-100
		externalUrl: series.url ?? null,
	};
}
