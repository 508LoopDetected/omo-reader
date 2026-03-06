/**
 * Core reading logic — single source of truth for read/unread status.
 */

import type { NsfwMode } from '../sources/settings.js';

/** A chapter is "read" when the user has reached within this many pages of the end. */
export const READ_THRESHOLD = 2;

/** Check if a chapter is considered read based on current page and total pages. */
export function isChapterRead(page: number, totalPages: number): boolean {
	return totalPages > 0 && page >= totalPages - READ_THRESHOLD;
}

/** Compute unread chapter counts per work from progress rows. Returns Map<"sourceId:workId", unreadCount>. */
export function computeUnreadCounts(
	progressRows: { sourceId: string; workId: string; page: number; totalPages: number }[],
): Map<string, number> {
	const map = new Map<string, { total: number; read: number }>();
	for (const p of progressRows) {
		const key = `${p.sourceId}:${p.workId}`;
		const entry = map.get(key) ?? { total: 0, read: 0 };
		entry.total++;
		if (isChapterRead(p.page, p.totalPages)) entry.read++;
		map.set(key, entry);
	}
	const unread = new Map<string, number>();
	for (const [key, val] of map) {
		if (val.total > val.read) {
			unread.set(key, val.total - val.read);
		}
	}
	return unread;
}

export interface ContinueReadingItem {
	sourceId: string;
	workId: string;
	chapterId: string;
	page: number;
	totalPages: number;
	updatedAt: string;
	title?: string;
	coverUrl?: string;
	nsfw?: boolean;
}

/** Build the "Continue Reading" list from recent progress and library metadata. */
export function buildContinueReading(
	progressRows: {
		sourceId: string;
		workId: string;
		chapterId: string;
		page: number;
		totalPages: number;
		updatedAt: Date | null;
	}[],
	libraryItems: { sourceId: string; workId: string; title: string; coverUrl: string | null; nsfw: boolean; libraryId: string | null }[],
	nsfwMode: NsfwMode,
	nsfwLibraryIds?: Set<string>,
	limit: number = 8,
): ContinueReadingItem[] {
	const libMap = new Map<string, { title: string; coverUrl: string | null; nsfw: boolean; libraryId: string | null }>();
	for (const item of libraryItems) {
		libMap.set(`${item.sourceId}:${item.workId}`, item);
	}

	const seen = new Set<string>();
	const result: ContinueReadingItem[] = [];

	for (const row of progressRows) {
		const key = `${row.sourceId}:${row.workId}`;
		if (seen.has(key)) continue;
		seen.add(key);

		// Skip fully read chapters
		if (isChapterRead(row.page, row.totalPages)) continue;

		const item: ContinueReadingItem = {
			sourceId: row.sourceId,
			workId: row.workId,
			chapterId: row.chapterId,
			page: row.page,
			totalPages: row.totalPages,
			updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : '',
		};

		const lib = libMap.get(key);
		if (lib) {
			item.title = lib.title;
			item.coverUrl = lib.coverUrl ?? undefined;
			item.nsfw = lib.nsfw;
		}
		result.push(item);
	}

	// Apply NSFW filter (account for NSFW libraries)
	const isNsfw = (i: ContinueReadingItem) => {
		if (i.nsfw) return true;
		const lib = libMap.get(`${i.sourceId}:${i.workId}`);
		return lib?.libraryId ? (nsfwLibraryIds?.has(lib.libraryId) ?? false) : false;
	};
	let filtered = result;
	if (nsfwMode === 'sfw') filtered = result.filter((i) => !isNsfw(i));
	else if (nsfwMode === 'nsfw') filtered = result.filter(isNsfw);

	return filtered.slice(0, limit);
}
