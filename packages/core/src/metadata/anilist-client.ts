/**
 * AniList GraphQL API client — manga metadata search and detail.
 * No API key required. Rate limit: 90 req/min.
 */

import { RateLimiter } from '../sources/rate-limiter.js';
import type { AniListMedia, AniListSearchResponse, AniListDetailResponse } from './anilist-types.js';
import type { MetadataSearchResult } from './metadata-types.js';

const ANILIST_URL = 'https://graphql.anilist.co';
const limiter = new RateLimiter(90, 60000);

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [300, 800, 2000];

const SEARCH_QUERY = `
query ($search: String, $perPage: Int) {
  Page(perPage: $perPage) {
    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
      id
      title { english romaji native }
      description
      coverImage { extraLarge large }
      bannerImage
      genres
      status
      averageScore
      startDate { year }
      synonyms
      siteUrl
      staff(sort: RELEVANCE, perPage: 10) {
        edges {
          role
          node { name { full } }
        }
      }
    }
  }
}`;

const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id, type: MANGA) {
    id
    title { english romaji native }
    description
    coverImage { extraLarge large }
    bannerImage
    genres
    status
    averageScore
    startDate { year }
    synonyms
    siteUrl
    staff(sort: RELEVANCE, perPage: 25) {
      edges {
        role
        node { name { full } }
      }
    }
  }
}`;

function isRetryable(err: unknown): boolean {
	if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) return true;
	if (err instanceof TypeError && (err as NodeJS.ErrnoException).cause) {
		const cause = (err as NodeJS.ErrnoException).cause as { code?: string };
		if (cause.code === 'UND_ERR_SOCKET' || cause.code === 'ECONNRESET' || cause.code === 'ETIMEDOUT') return true;
	}
	return false;
}

async function gql<T>(query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		await limiter.acquire(signal);
		try {
			const fetchSignal = signal
				? AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)])
				: AbortSignal.timeout(FETCH_TIMEOUT_MS);
			const res = await fetch(ANILIST_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query, variables }),
				signal: fetchSignal,
			});
			if (res.status === 429) {
				const retryAfter = parseInt(res.headers.get('retry-after') ?? '60') * 1000;
				await new Promise((r) => setTimeout(r, retryAfter));
				continue;
			}
			if (!res.ok) throw new Error(`AniList API error ${res.status}: ${res.statusText}`);
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

function mapStatus(status: AniListMedia['status']): string | null {
	switch (status) {
		case 'FINISHED': return 'completed';
		case 'RELEASING': return 'ongoing';
		case 'HIATUS': return 'hiatus';
		case 'CANCELLED': return 'cancelled';
		default: return null;
	}
}

function extractStaff(media: AniListMedia): { author: string | null; artist: string | null } {
	const edges = media.staff?.edges ?? [];
	let author: string | null = null;
	let artist: string | null = null;
	for (const edge of edges) {
		const name = edge.node.name.full;
		if (!name) continue;
		const role = edge.role.toLowerCase();
		if (role.includes('story') && !author) author = name;
		if (role.includes('art') && !artist) artist = name;
	}
	return { author, artist };
}

function mediaToSearchResult(media: AniListMedia): MetadataSearchResult {
	return {
		providerId: String(media.id),
		title: media.title.english ?? media.title.romaji ?? media.title.native ?? '',
		altTitles: [
			media.title.english,
			media.title.romaji,
			media.title.native,
			...(media.synonyms ?? []),
		].filter((t): t is string => !!t),
		year: media.startDate?.year ?? null,
		coverUrl: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
		description: stripHtml(media.description),
		status: mapStatus(media.status),
	};
}

/** Search AniList for manga matching a title. */
export async function searchAniList(query: string, perPage = 10, signal?: AbortSignal): Promise<MetadataSearchResult[]> {
	const res = await gql<AniListSearchResponse>(SEARCH_QUERY, { search: query, perPage }, signal);
	return res.data.Page.media.map(mediaToSearchResult);
}

/** Fetch full detail for an AniList manga by ID. Returns the raw media object for storage. */
export async function getAniListDetail(id: number, signal?: AbortSignal): Promise<{
	result: MetadataSearchResult;
	media: AniListMedia;
	author: string | null;
	artist: string | null;
	bannerUrl: string | null;
	communityScore: number | null;
	externalUrl: string | null;
}> {
	const res = await gql<AniListDetailResponse>(DETAIL_QUERY, { id }, signal);
	const media = res.data.Media;
	const { author, artist } = extractStaff(media);
	return {
		result: mediaToSearchResult(media),
		media,
		author,
		artist,
		bannerUrl: media.bannerImage ?? null,
		communityScore: media.averageScore ?? null,
		externalUrl: media.siteUrl ?? null,
	};
}
