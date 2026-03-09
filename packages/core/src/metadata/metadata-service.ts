/**
 * Metadata service — orchestrates online metadata fetching, matching, and storage.
 * Provider priority: MangaUpdates (primary for manga), AniList (secondary), Comic Vine (western).
 * "Local wins" rule: local source data is always preferred; online fills gaps.
 */

import { db } from '../db/client.js';
import { onlineMetadata, library, appSettings, userLibraries } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { searchMangaUpdates, getMangaUpdatesDetail } from './mangaupdates-client.js';
import { searchAniList, getAniListDetail } from './anilist-client.js';
import { searchComicVine, getComicVineDetail } from './comicvine-client.js';
import type { MetadataProvider, MetadataSearchResult, OnlineMetadata, StoredOnlineMetadata, MetadataOverrides } from './metadata-types.js';

// ── Title normalization ──

function normalize(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^\w\s]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Simple bigram similarity (Dice coefficient). */
function similarity(a: string, b: string): number {
	const na = normalize(a);
	const nb = normalize(b);
	if (na === nb) return 1;
	if (na.length < 2 || nb.length < 2) return 0;

	const bigrams = (s: string): Map<string, number> => {
		const map = new Map<string, number>();
		for (let i = 0; i < s.length - 1; i++) {
			const bi = s.slice(i, i + 2);
			map.set(bi, (map.get(bi) ?? 0) + 1);
		}
		return map;
	};

	const aBi = bigrams(na);
	const bBi = bigrams(nb);
	let intersection = 0;
	for (const [bi, count] of aBi) {
		intersection += Math.min(count, bBi.get(bi) ?? 0);
	}
	return (2 * intersection) / (na.length - 1 + nb.length - 1);
}

const MATCH_THRESHOLD = 0.75;

// ── Helpers ──

function getComicVineApiKey(): string | null {
	const row = db.select().from(appSettings).where(eq(appSettings.key, 'metadata.comicvineApiKey')).get();
	return row?.value ?? null;
}

function getStoredMetadata(sourceId: string, workId: string): StoredOnlineMetadata | null {
	const row = db.select().from(onlineMetadata)
		.where(and(eq(onlineMetadata.sourceId, sourceId), eq(onlineMetadata.workId, workId)))
		.get();
	if (!row) return null;
	return {
		...row,
		altTitles: row.altTitles ? JSON.parse(row.altTitles) : null,
		genres: row.genres ? JSON.parse(row.genres) : null,
		manualLink: !!row.manualLink,
	} as StoredOnlineMetadata;
}

function storeMetadata(
	sourceId: string,
	workId: string,
	meta: OnlineMetadata,
): void {
	const existing = db.select({ id: onlineMetadata.id })
		.from(onlineMetadata)
		.where(and(eq(onlineMetadata.sourceId, sourceId), eq(onlineMetadata.workId, workId)))
		.get();

	const data = {
		sourceId,
		workId,
		provider: meta.provider,
		providerId: meta.providerId,
		title: meta.title,
		altTitles: meta.altTitles ? JSON.stringify(meta.altTitles) : null,
		author: meta.author,
		artist: meta.artist,
		description: meta.description,
		genres: meta.genres ? JSON.stringify(meta.genres) : null,
		status: meta.status,
		publisher: meta.publisher,
		year: meta.year,
		coverUrl: meta.coverUrl,
		bannerUrl: meta.bannerUrl,
		communityScore: meta.communityScore,
		externalUrl: meta.externalUrl,
		rawData: meta.rawData,
		fetchedAt: meta.fetchedAt,
		manualLink: meta.manualLink,
	};

	if (existing) {
		db.update(onlineMetadata).set(data).where(eq(onlineMetadata.id, existing.id)).run();
	} else {
		db.insert(onlineMetadata).values(data).run();
	}
}

// ── Provider detection ──

/** Determine which provider to use based on library type. */
function detectProvider(sourceId: string, workId: string): MetadataProvider {
	const libEntry = db.select({ libraryId: library.libraryId })
		.from(library)
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.get();

	if (libEntry?.libraryId) {
		const ul = db.select({ type: userLibraries.type })
			.from(userLibraries)
			.where(eq(userLibraries.id, libEntry.libraryId))
			.get();
		if (ul?.type === 'western') return 'comicvine';
	}

	// Default to mangaupdates for manga/webcomic/unknown
	return 'mangaupdates';
}

// ── Auto-match ──

/** Find best match from search results using title similarity. */
function findBestMatch(
	localTitle: string,
	results: MetadataSearchResult[],
): MetadataSearchResult | null {
	let best: MetadataSearchResult | null = null;
	let bestScore = 0;

	for (const r of results) {
		// Check main title
		let score = similarity(localTitle, r.title);

		// Check alt titles too
		for (const alt of r.altTitles) {
			const altScore = similarity(localTitle, alt);
			if (altScore > score) score = altScore;
		}

		if (score > bestScore) {
			bestScore = score;
			best = r;
		}
	}

	return bestScore >= MATCH_THRESHOLD ? best : null;
}

// ── Public API ──

/** Search a metadata provider. */
export async function searchMetadata(
	provider: MetadataProvider,
	query: string,
	signal?: AbortSignal,
): Promise<MetadataSearchResult[]> {
	if (provider === 'mangaupdates') {
		return searchMangaUpdates(query, 10, signal);
	}
	if (provider === 'anilist') {
		return searchAniList(query, 10, signal);
	}
	const apiKey = getComicVineApiKey();
	if (!apiKey) throw new Error('Comic Vine API key not configured');
	return searchComicVine(query, apiKey, 10, signal);
}

/** Get current metadata status for a work. */
export function getMetadataStatus(sourceId: string, workId: string): {
	linked: boolean;
	provider: MetadataProvider | null;
	providerId: string | null;
	manualLink: boolean;
	fetchedAt: number | null;
} {
	const stored = getStoredMetadata(sourceId, workId);
	if (!stored) return { linked: false, provider: null, providerId: null, manualLink: false, fetchedAt: null };
	return {
		linked: true,
		provider: stored.provider,
		providerId: stored.providerId,
		manualLink: stored.manualLink,
		fetchedAt: stored.fetchedAt,
	};
}

/** Fetch metadata for a single work. Auto-matches by title if no existing link. */
export async function fetchMetadata(
	sourceId: string,
	workId: string,
	signal?: AbortSignal,
): Promise<{ matched: boolean; provider: MetadataProvider; providerId: string | null }> {
	// Check if already linked
	const existing = getStoredMetadata(sourceId, workId);

	// If manually linked or recently fetched (< 7 days), re-fetch detail from same provider
	if (existing) {
		const meta = await fetchDetail(existing.provider, existing.providerId, signal);
		if (meta) {
			storeMetadata(sourceId, workId, {
				...meta,
				manualLink: existing.manualLink,
			});
		}
		return { matched: true, provider: existing.provider, providerId: existing.providerId };
	}

	// Get local title
	const libEntry = db.select({ title: library.title })
		.from(library)
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.get();

	if (!libEntry) throw new Error('Work not found in library');

	const provider = detectProvider(sourceId, workId);

	// Search and auto-match
	let results: MetadataSearchResult[];
	try {
		results = await searchMetadata(provider, libEntry.title, signal);
	} catch {
		return { matched: false, provider, providerId: null };
	}

	const match = findBestMatch(libEntry.title, results);
	if (!match) return { matched: false, provider, providerId: null };

	// Fetch full detail
	const meta = await fetchDetail(provider, match.providerId, signal);
	if (!meta) return { matched: false, provider, providerId: null };

	storeMetadata(sourceId, workId, { ...meta, manualLink: false });
	return { matched: true, provider, providerId: match.providerId };
}

/** Manually link a work to a provider ID. */
export async function linkMetadata(
	sourceId: string,
	workId: string,
	provider: MetadataProvider,
	providerId: string,
	signal?: AbortSignal,
): Promise<OnlineMetadata> {
	const meta = await fetchDetail(provider, providerId, signal);
	if (!meta) throw new Error(`Could not fetch detail from ${provider} for ID ${providerId}`);

	const stored: OnlineMetadata = { ...meta, manualLink: true };
	storeMetadata(sourceId, workId, stored);
	return stored;
}

/** Unlink metadata from a work. */
export function unlinkMetadata(sourceId: string, workId: string): void {
	db.delete(onlineMetadata)
		.where(and(eq(onlineMetadata.sourceId, sourceId), eq(onlineMetadata.workId, workId)))
		.run();
}

/** Bulk fetch metadata for library items. Skips recently fetched (< 30 days). */
export async function fetchLibraryMetadata(
	libraryId?: string,
	signal?: AbortSignal,
): Promise<{ total: number; matched: number; skipped: number; failed: number }> {
	let items;
	if (libraryId) {
		items = db.select({ sourceId: library.sourceId, workId: library.workId })
			.from(library)
			.where(eq(library.libraryId, libraryId))
			.all();
	} else {
		items = db.select({ sourceId: library.sourceId, workId: library.workId })
			.from(library)
			.all();
	}

	const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
	let matched = 0;
	let skipped = 0;
	let failed = 0;

	for (const item of items) {
		if (signal?.aborted) break;

		// Skip if recently fetched
		const existing = getStoredMetadata(item.sourceId, item.workId);
		if (existing && existing.fetchedAt > thirtyDaysAgo) {
			skipped++;
			continue;
		}

		try {
			const result = await fetchMetadata(item.sourceId, item.workId, signal);
			if (result.matched) matched++;
			else failed++;
		} catch {
			failed++;
		}
	}

	return { total: items.length, matched, skipped, failed };
}

/**
 * Merge online metadata into work data.
 * Supports global preference toggles and per-work field overrides.
 */
export function mergeOnlineMetadata(
	sourceId: string,
	workId: string,
	localWork: {
		author: string | null;
		artist: string | null;
		description: string | null;
		genres: string | null;
		status: string | null;
		coverUrl: string | null;
	} | null,
	options?: {
		preferLocal?: boolean;
		preferLocalArt?: boolean;
		overrides?: MetadataOverrides;
	},
): {
	onlineMeta: StoredOnlineMetadata | null;
	merged: {
		author: string | null;
		artist: string | null;
		description: string | null;
		genres: string | null;
		status: string | null;
		coverUrl: string | null;
		bannerUrl: string | null;
		communityScore: number | null;
		externalUrl: string | null;
		year: number | null;
		publisher: string | null;
	};
} {
	const stored = getStoredMetadata(sourceId, workId);
	const preferLocal = options?.preferLocal ?? true;
	const preferLocalArt = options?.preferLocalArt ?? true;
	const overrides = options?.overrides;

	const base = {
		author: localWork?.author ?? null,
		artist: localWork?.artist ?? null,
		description: localWork?.description ?? null,
		genres: localWork?.genres ?? null,
		status: localWork?.status ?? null,
		coverUrl: localWork?.coverUrl ?? null,
		bannerUrl: null as string | null,
		communityScore: null as number | null,
		externalUrl: null as string | null,
		year: null as number | null,
		publisher: null as string | null,
	};

	if (!stored) return { onlineMeta: null, merged: base };

	/** Pick between local and online based on per-work override or global pref. */
	function pick(field: keyof MetadataOverrides, local: string | null, online: string | null, preferLocalDefault: boolean): string | null {
		const override = overrides?.[field];
		if (override === 'online') return online || local;
		if (override === 'local') return local || online;
		// No override — use global preference
		if (preferLocalDefault) return local || online;
		return online || local;
	}

	const onlineGenres = stored.genres ? JSON.stringify(stored.genres) : null;

	return {
		onlineMeta: stored,
		merged: {
			author: pick('author', base.author, stored.author, preferLocal),
			artist: pick('artist', base.artist, stored.artist, preferLocal),
			description: pick('description', base.description, stored.description, preferLocal),
			genres: pick('genres', base.genres, onlineGenres, preferLocal),
			status: pick('status', base.status, stored.status, preferLocal),
			coverUrl: pick('coverUrl', base.coverUrl, stored.coverUrl, preferLocalArt),
			// Additive fields — always use online data
			bannerUrl: stored.bannerUrl,
			communityScore: stored.communityScore,
			externalUrl: stored.externalUrl,
			year: stored.year,
			publisher: stored.publisher,
		},
	};
}

// ── Internal: fetch detail from provider ──

async function fetchDetail(
	provider: MetadataProvider,
	providerId: string,
	signal?: AbortSignal,
): Promise<OnlineMetadata | null> {
	const now = Date.now();

	if (provider === 'mangaupdates') {
		const detail = await getMangaUpdatesDetail(parseInt(providerId), signal);
		return {
			provider: 'mangaupdates',
			providerId,
			title: detail.result.title,
			altTitles: detail.result.altTitles,
			author: detail.author,
			artist: detail.artist,
			description: detail.result.description,
			genres: detail.series.genres?.map((g) => g.genre) ?? null,
			status: detail.result.status,
			publisher: detail.publishers[0] ?? null,
			year: detail.result.year,
			coverUrl: detail.result.coverUrl,
			bannerUrl: null,
			communityScore: detail.communityScore,
			externalUrl: detail.externalUrl,
			rawData: JSON.stringify(detail.series),
			fetchedAt: now,
			manualLink: false,
		};
	}

	if (provider === 'anilist') {
		const detail = await getAniListDetail(parseInt(providerId), signal);
		return {
			provider: 'anilist',
			providerId,
			title: detail.result.title,
			altTitles: detail.result.altTitles,
			author: detail.author,
			artist: detail.artist,
			description: detail.result.description,
			genres: detail.media.genres ?? null,
			status: detail.result.status,
			publisher: null,
			year: detail.result.year,
			coverUrl: detail.result.coverUrl,
			bannerUrl: detail.bannerUrl,
			communityScore: detail.communityScore,
			externalUrl: detail.externalUrl,
			rawData: JSON.stringify(detail.media),
			fetchedAt: now,
			manualLink: false,
		};
	}

	if (provider === 'comicvine') {
		const apiKey = getComicVineApiKey();
		if (!apiKey) throw new Error('Comic Vine API key not configured');

		const detail = await getComicVineDetail(parseInt(providerId), apiKey, signal);
		return {
			provider: 'comicvine',
			providerId,
			title: detail.result.title,
			altTitles: detail.result.altTitles,
			author: null,
			artist: null,
			description: detail.result.description,
			genres: null,
			status: detail.result.status,
			publisher: detail.publisher,
			year: detail.result.year,
			coverUrl: detail.result.coverUrl,
			bannerUrl: null,
			communityScore: detail.communityScore,
			externalUrl: detail.externalUrl,
			rawData: JSON.stringify(detail.volume),
			fetchedAt: now,
			manualLink: false,
		};
	}

	return null;
}
