/**
 * Search suggest service — fast local DB search for the global autosuggest dropdown.
 *
 * Searches library titles, authors/artists, collections, and genres.
 * Returns categorized results for instant display as the user types.
 */

import { db } from '../db/client.js';
import { library, collections, userLibraries } from '../db/schema.js';

export interface SuggestResult {
	titles: { sourceId: string; workId: string; title: string; coverUrl: string | null; author: string | null }[];
	authors: { name: string; count: number }[];
	collections: { id: string; name: string }[];
	genres: { name: string; count: number }[];
}

/**
 * Search local data for autosuggest. Fast — queries only the local DB.
 * Returns at most `limit` results per category.
 */
export function suggest(query: string, limit: number = 6): SuggestResult {
	const q = query.toLowerCase().trim();
	if (!q) return { titles: [], authors: [], collections: [], genres: [] };

	// ── Titles (match on title or author) ──
	const allItems = db.select({
		sourceId: library.sourceId,
		workId: library.workId,
		title: library.title,
		coverUrl: library.coverUrl,
		author: library.author,
		artist: library.artist,
		genres: library.genres,
	}).from(library).all();

	const titles = allItems
		.filter(item =>
			item.title.toLowerCase().includes(q) ||
			(item.author && item.author.toLowerCase().includes(q)) ||
			(item.artist && item.artist.toLowerCase().includes(q))
		)
		.slice(0, limit)
		.map(item => ({
			sourceId: item.sourceId,
			workId: item.workId,
			title: item.title,
			coverUrl: item.coverUrl,
			author: item.author,
		}));

	// ── Authors/artists ──
	const authorMap = new Map<string, number>();
	for (const item of allItems) {
		for (const name of [item.author, item.artist]) {
			if (name && name.toLowerCase().includes(q)) {
				authorMap.set(name, (authorMap.get(name) ?? 0) + 1);
			}
		}
	}
	const authors = [...authorMap.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([name, count]) => ({ name, count }));

	// ── Collections ──
	const allCollections = db.select({ id: collections.id, name: collections.name }).from(collections).all();
	const matchedCollections = allCollections
		.filter(c => c.name.toLowerCase().includes(q))
		.slice(0, limit);

	// ── Genres ──
	const genreMap = new Map<string, number>();
	for (const item of allItems) {
		if (!item.genres) continue;
		try {
			const parsed: string[] = JSON.parse(item.genres);
			for (const genre of parsed) {
				if (genre.toLowerCase().includes(q)) {
					genreMap.set(genre, (genreMap.get(genre) ?? 0) + 1);
				}
			}
		} catch { /* skip malformed */ }
	}
	const genres = [...genreMap.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([name, count]) => ({ name, count }));

	return { titles, authors, collections: matchedCollections, genres };
}
