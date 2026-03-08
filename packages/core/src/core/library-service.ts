/**
 * Library service — enriched library queries with server-side sort/filter/unread,
 * plus CRUD operations for library entries.
 */

import { db } from '../db/client.js';
import {
	library,
	readingProgress,
	userLibraries as userLibrariesTable,
	collections as collectionsTable,
	collectionItems,
} from '../db/schema.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { isChapterRead, computeUnreadCounts, buildContinueReading } from './reading.js';
import { getNsfwMode } from '../sources/settings.js';
import { getAllUserLibraries } from './user-libraries-service.js';
import { getDetail, getAllSources, browseSource } from '../sources/manager.js';
import { getRating, getWorkActivity } from './stats-service.js';
import type { EnrichedLibraryItem, HomeData, LibraryQueryOptions, CollectionQueryOptions, WorkCompositeData } from './types.js';

// ── Internal helpers ──

/** Get all reading progress rows (for unread count computation). */
function getAllProgress() {
	return db
		.select({
			sourceId: readingProgress.sourceId,
			workId: readingProgress.workId,
			chapterId: readingProgress.chapterId,
			page: readingProgress.page,
			totalPages: readingProgress.totalPages,
		})
		.from(readingProgress)
		.all();
}

/** Add unreadCount to library rows. */
function enrichItems(
	items: (typeof library.$inferSelect)[],
	unreadMap: Map<string, number>,
): EnrichedLibraryItem[] {
	return items.map((item) => ({
		...item,
		unreadCount: unreadMap.get(`${item.sourceId}:${item.workId}`) ?? 0,
	}));
}

function filterNsfw<T extends { nsfw: boolean; libraryId: string | null }>(
	items: T[],
	mode: string,
	nsfwLibraryIds?: Set<string>,
): T[] {
	if (mode === 'all') return items;
	const isNsfw = (i: T) => i.nsfw || (nsfwLibraryIds?.has(i.libraryId ?? '') ?? false);
	if (mode === 'nsfw') return items.filter(isNsfw);
	return items.filter((i) => !isNsfw(i));
}

/** Build a set of user library IDs that are flagged as NSFW. */
function getNsfwLibraryIds(): Set<string> {
	return new Set(getAllUserLibraries().filter((l) => l.nsfw).map((l) => l.id));
}

function filterSearch<T extends { title: string; author: string | null }>(items: T[], search: string): T[] {
	const q = search.toLowerCase();
	return items.filter(
		(item) =>
			item.title.toLowerCase().includes(q) ||
			(item.author && item.author.toLowerCase().includes(q)),
	);
}

function sortItems<T extends { title: string; lastReadAt: Date | null; addedAt: Date | null }>(
	items: T[],
	sort: 'title' | 'recent' | 'added',
): T[] {
	return [...items].sort((a, b) => {
		switch (sort) {
			case 'title':
				return a.title.localeCompare(b.title);
			case 'recent': {
				const ta = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0;
				const tb = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0;
				return tb - ta;
			}
			case 'added': {
				const ta = a.addedAt ? new Date(a.addedAt).getTime() : 0;
				const tb = b.addedAt ? new Date(b.addedAt).getTime() : 0;
				return tb - ta;
			}
			default:
				return 0;
		}
	});
}

// ── Public API ──

// ── CRUD operations ──

/** Get raw (non-enriched) library items, optionally filtered by libraryId. */
export function getRawLibrary(libraryId?: string) {
	if (libraryId) {
		return db.select().from(library).where(eq(library.libraryId, libraryId)).all();
	}
	return db.select().from(library).all();
}

export interface AddToLibraryInput {
	sourceId: string;
	workId: string;
	title: string;
	coverUrl?: string | null;
	url: string;
	author?: string | null;
	artist?: string | null;
	description?: string | null;
	genres?: string[] | null;
	status?: string | null;
	nsfw?: boolean;
	libraryId?: string | null;
}

/** Add a title to the library. Returns { id, alreadyExists }. */
export function addToLibrary(input: AddToLibraryInput): { id: number | bigint; alreadyExists: boolean } {
	const existing = db
		.select()
		.from(library)
		.where(and(eq(library.sourceId, input.sourceId), eq(library.workId, input.workId)))
		.get();

	if (existing) {
		return { id: existing.id, alreadyExists: true };
	}

	const inserted = db.insert(library).values({
		sourceId: input.sourceId,
		workId: input.workId,
		title: input.title,
		coverUrl: input.coverUrl ?? null,
		url: input.url,
		author: input.author ?? null,
		artist: input.artist ?? null,
		description: input.description ?? null,
		genres: input.genres ? JSON.stringify(input.genres) : null,
		status: input.status ?? null,
		nsfw: input.nsfw ?? false,
		libraryId: input.libraryId ?? null,
	}).returning({ id: library.id }).get();

	return { id: inserted!.id, alreadyExists: false };
}

/** Update a library entry's libraryId. Throws if not found. */
export function updateLibraryEntry(
	sourceId: string,
	workId: string,
	updates: { libraryId?: string | null },
): void {
	const entry = db.select({ id: library.id })
		.from(library)
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.get();

	if (!entry) throw new Error('Title not in library');

	const setObj: Record<string, unknown> = {};
	if (updates.libraryId !== undefined) setObj.libraryId = updates.libraryId;

	if (Object.keys(setObj).length > 0) {
		db.update(library).set(setObj).where(eq(library.id, entry.id)).run();
	}
}

/** Remove a title from the library. */
export function removeFromLibrary(sourceId: string, workId: string): void {
	db.delete(library)
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.run();
}

/** Bulk add titles from a source's first browse page into the library. */
export async function bulkAddFromSource(
	sourceId: string,
	libraryId?: string | null,
): Promise<{ added: number; skipped: number; moved: number }> {
	const result = await browseSource(sourceId, 1, 'popular');
	let added = 0;
	let skipped = 0;
	let moved = 0;

	for (const item of result.items) {
		const existing = db
			.select({ id: library.id, libraryId: library.libraryId })
			.from(library)
			.where(and(eq(library.sourceId, sourceId), eq(library.workId, item.id)))
			.get();

		if (existing) {
			const targetLibraryId = libraryId ?? null;
			if (existing.libraryId !== targetLibraryId) {
				db.update(library).set({ libraryId: targetLibraryId }).where(eq(library.id, existing.id)).run();
				moved++;
			} else {
				skipped++;
			}
			continue;
		}

		db.insert(library).values({
			sourceId,
			workId: item.id,
			title: item.title,
			coverUrl: item.coverUrl ?? null,
			url: item.url,
			author: item.author ?? null,
			artist: item.artist ?? null,
			description: item.description ?? null,
			genres: item.genres ? JSON.stringify(item.genres) : null,
			status: item.status ?? null,
			nsfw: item.nsfw ?? false,
			libraryId: libraryId ?? null,
		}).run();
		added++;
	}

	return { added, skipped, moved };
}

/** Move a library entry to a different user library. */
export function moveLibraryEntry(sourceId: string, workId: string, libraryId: string | null): void {
	db.update(library)
		.set({ libraryId: libraryId ?? null })
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.run();
}

/** Update the NSFW flag for a library entry. */
export function updateNsfw(sourceId: string, workId: string, nsfw: boolean): void {
	db.update(library)
		.set({ nsfw })
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.run();
}

/** Update the title for a library entry. */
export function updateTitle(sourceId: string, workId: string, title: string): void {
	db.update(library)
		.set({ title })
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.run();
}

// ── Enriched queries ──

/** Query library items with enrichment (unread counts) and server-side sort/filter. */
export function queryLibrary(opts: LibraryQueryOptions = {}): EnrichedLibraryItem[] {
	const items = opts.libraryId
		? db.select().from(library).where(eq(library.libraryId, opts.libraryId)).all()
		: db.select().from(library).all();

	const progress = getAllProgress();
	const unreadMap = computeUnreadCounts(progress);
	let enriched = enrichItems(items, unreadMap);

	const nsfwMode = opts.nsfwMode ?? getNsfwMode();
	const nsfwLibIds = getNsfwLibraryIds();
	enriched = filterNsfw(enriched, nsfwMode, nsfwLibIds);

	if (opts.search?.trim()) {
		enriched = filterSearch(enriched, opts.search.trim());
	}

	return sortItems(enriched, opts.sort ?? 'recent');
}

/** Query collection items with enrichment and server-side sort/filter. */
export function queryCollectionItems(
	collectionId: string,
	opts: CollectionQueryOptions = {},
): EnrichedLibraryItem[] {
	const memberRows = db
		.select({ libraryItemId: collectionItems.libraryItemId })
		.from(collectionItems)
		.where(eq(collectionItems.collectionId, collectionId))
		.all();

	if (memberRows.length === 0) return [];

	const ids = memberRows.map((r) => r.libraryItemId);
	const items = db.select().from(library).where(inArray(library.id, ids)).all();

	const progress = getAllProgress();
	const unreadMap = computeUnreadCounts(progress);
	let enriched = enrichItems(items, unreadMap);

	const nsfwMode = opts.nsfwMode ?? getNsfwMode();
	const nsfwLibIds = getNsfwLibraryIds();
	enriched = filterNsfw(enriched, nsfwMode, nsfwLibIds);

	if (opts.search?.trim()) {
		enriched = filterSearch(enriched, opts.search.trim());
	}

	return sortItems(enriched, opts.sort ?? 'title');
}

/** Get composite home page data (continue reading + recent library). */
export function getHomeData(nsfwMode?: string): HomeData {
	const mode = (nsfwMode ?? getNsfwMode()) as 'sfw' | 'nsfw' | 'all';

	// Recent non-dismissed progress for continue reading
	const recentProgress = db
		.select({
			sourceId: readingProgress.sourceId,
			workId: readingProgress.workId,
			chapterId: readingProgress.chapterId,
			page: readingProgress.page,
			totalPages: readingProgress.totalPages,
			updatedAt: readingProgress.updatedAt,
		})
		.from(readingProgress)
		.innerJoin(
			library,
			and(
				eq(readingProgress.sourceId, library.sourceId),
				eq(readingProgress.workId, library.workId),
			),
		)
		.where(eq(readingProgress.dismissed, false))
		.orderBy(desc(readingProgress.updatedAt))
		.limit(50)
		.all();

	const allLibraryItems = db.select().from(library).all();
	const nsfwLibIds = getNsfwLibraryIds();
	const continueReading = buildContinueReading(recentProgress, allLibraryItems, mode, nsfwLibIds);

	// Enriched recent library
	const allProgress = getAllProgress();
	const unreadMap = computeUnreadCounts(allProgress);
	let recentLibrary = enrichItems(allLibraryItems, unreadMap);
	recentLibrary = filterNsfw(recentLibrary, mode, nsfwLibIds);
	recentLibrary = sortItems(recentLibrary, 'recent');
	recentLibrary = recentLibrary.slice(0, 12);

	return { continueReading, recentLibrary };
}

/** Get composite work detail data (replaces 5+ parallel fetches). */
export async function getWorkComposite(
	sourceId: string,
	workId: string,
	fallbackTitle?: string,
): Promise<WorkCompositeData> {
	const detail = await getDetail(sourceId, workId, fallbackTitle);

	const libEntry = db
		.select()
		.from(library)
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.get();

	// Auto-repair stale library data
	if (libEntry && detail.work) {
		const updates: Record<string, unknown> = {};

		if (detail.work.title !== 'Unknown' && libEntry.title === 'Unknown') {
			updates.title = detail.work.title;
		}
		const workNsfw = detail.work.nsfw ?? false;
		if (libEntry.nsfw !== workNsfw) {
			updates.nsfw = workNsfw;
		}
		// Sync cover URL from live scan
		if (detail.work.coverUrl && detail.work.coverUrl !== libEntry.coverUrl) {
			updates.coverUrl = detail.work.coverUrl;
		}

		if (Object.keys(updates).length > 0) {
			db.update(library)
				.set(updates)
				.where(eq(library.id, libEntry.id))
				.run();
		}
	}

	// Progress for this work
	const progRows = db
		.select({
			chapterId: readingProgress.chapterId,
			page: readingProgress.page,
			totalPages: readingProgress.totalPages,
		})
		.from(readingProgress)
		.where(and(eq(readingProgress.sourceId, sourceId), eq(readingProgress.workId, workId)))
		.all();

	const progressMap: Record<string, { page: number; totalPages: number }> = {};
	for (const p of progRows) {
		progressMap[p.chapterId] = { page: p.page, totalPages: p.totalPages };
	}

	const readCount = Object.values(progressMap).filter((p) =>
		isChapterRead(p.page, p.totalPages),
	).length;

	// Source info
	const allSources = getAllSources();
	const source = allSources.find((s) => s.id === sourceId) ?? null;

	// User libraries
	const userLibraries = db.select().from(userLibrariesTable).all();

	// Collections for this title
	let allCollections: (typeof collectionsTable.$inferSelect)[] = [];
	let titleCollectionIds: string[] = [];

	if (libEntry) {
		allCollections = db.select().from(collectionsTable).all();
		const memberRows = db
			.select({ collectionId: collectionItems.collectionId })
			.from(collectionItems)
			.where(eq(collectionItems.libraryItemId, libEntry.id))
			.all();
		titleCollectionIds = memberRows.map((r) => r.collectionId);
	}

	return {
		work: detail.work,
		chapters: detail.chapters,
		source,
		inLibrary: !!libEntry,
		libraryId: libEntry?.libraryId ?? null,
		progressMap,
		readCount,
		userLibraries,
		collections: allCollections,
		titleCollectionIds,
		readerSettings: {
			direction: libEntry?.readerDirection ?? null,
			offset: libEntry?.readerOffset ?? null,
			coverArtMode: libEntry?.coverArtMode ?? null,
		},
		rating: getRating(sourceId, workId),
		readingActivity: getWorkActivity(sourceId, workId, 365),
	};
}
