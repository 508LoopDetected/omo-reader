/**
 * Mapping helpers for MangaDex API responses → our internal types.
 */

import type { MangaDexManga, MangaDexChapter, MangaDexRelationship, MangaDexLocalizedString } from './mangadex-types.js';
import type { WorkEntry, Chapter } from '../../types/work.js';

const SOURCE_ID = 'mangadex';

/** Extract best title from localized title + altTitles. Prefer en → ja-ro → ja → first. */
export function extractTitle(
	title: MangaDexLocalizedString,
	altTitles: MangaDexLocalizedString[] = [],
): string {
	if (title.en) return title.en;

	// Check alt titles for English
	for (const alt of altTitles) {
		if (alt.en) return alt.en;
	}

	// Romanized Japanese
	if (title['ja-ro']) return title['ja-ro'];
	for (const alt of altTitles) {
		if (alt['ja-ro']) return alt['ja-ro'];
	}

	// Japanese
	if (title.ja) return title.ja;
	for (const alt of altTitles) {
		if (alt.ja) return alt.ja;
	}

	// First available key
	const firstKey = Object.keys(title)[0];
	if (firstKey) return title[firstKey];

	return 'Unknown';
}

/** Extract description, preferring English. */
export function extractDescription(desc: MangaDexLocalizedString): string | undefined {
	if (!desc) return undefined;
	if (desc.en) return desc.en;
	const firstKey = Object.keys(desc)[0];
	return firstKey ? desc[firstKey] : undefined;
}

/** Build cover URL from manga relationships. */
export function getCoverUrl(mangaId: string, relationships: MangaDexRelationship[]): string | undefined {
	const coverRel = relationships.find((r) => r.type === 'cover_art');
	if (!coverRel?.attributes) return undefined;
	const fileName = coverRel.attributes.fileName as string | undefined;
	if (!fileName) return undefined;
	const raw = `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.512.jpg`;
	return `/api/proxy/image?url=${encodeURIComponent(raw)}&referer=${encodeURIComponent('https://mangadex.org')}`;
}

/** Extract author name from relationships. */
export function getAuthor(relationships: MangaDexRelationship[]): string | undefined {
	const author = relationships.find((r) => r.type === 'author');
	return author?.attributes?.name as string | undefined;
}

/** Extract artist name from relationships. */
export function getArtist(relationships: MangaDexRelationship[]): string | undefined {
	const artist = relationships.find((r) => r.type === 'artist');
	return artist?.attributes?.name as string | undefined;
}

/** Extract genre tags. */
function getGenres(manga: MangaDexManga): string[] {
	return manga.attributes.tags
		.filter((t) => t.attributes.group === 'genre' || t.attributes.group === 'theme')
		.map((t) => t.attributes.name.en ?? Object.values(t.attributes.name)[0] ?? '')
		.filter(Boolean);
}

/** Map MangaDex status to our status type. */
function mapStatus(status: string): WorkEntry['status'] {
	switch (status) {
		case 'ongoing': return 'ongoing';
		case 'completed': return 'completed';
		case 'hiatus': return 'hiatus';
		case 'cancelled': return 'cancelled';
		default: return 'unknown';
	}
}

/** Map a MangaDex manga object to our WorkEntry type. */
export function mapMangaToEntry(manga: MangaDexManga): WorkEntry {
	const rating = manga.attributes.contentRating;
	return {
		id: manga.id,
		sourceId: SOURCE_ID,
		title: extractTitle(manga.attributes.title, manga.attributes.altTitles),
		coverUrl: getCoverUrl(manga.id, manga.relationships),
		url: `https://mangadex.org/title/${manga.id}`,
		author: getAuthor(manga.relationships),
		artist: getArtist(manga.relationships),
		description: extractDescription(manga.attributes.description),
		genres: getGenres(manga),
		status: mapStatus(manga.attributes.status),
		nsfw: rating === 'erotica' || rating === 'pornographic',
	};
}

/** Map a MangaDex chapter to our Chapter type. */
export function mapChapterToOurs(ch: MangaDexChapter, workId: string): Chapter {
	const chNum = ch.attributes.chapter ? parseFloat(ch.attributes.chapter) : undefined;
	const vol = ch.attributes.volume;
	const chTitle = ch.attributes.title;

	let title: string;
	if (chNum !== undefined) {
		title = vol ? `Vol. ${vol} Ch. ${ch.attributes.chapter}` : `Ch. ${ch.attributes.chapter}`;
		if (chTitle) title += ` - ${chTitle}`;
	} else {
		title = chTitle ?? 'Oneshot';
	}

	const scanlationGroup = ch.relationships.find((r) => r.type === 'scanlation_group');
	const scanlator = scanlationGroup?.attributes?.name as string | undefined;

	return {
		id: ch.id,
		workId,
		sourceId: SOURCE_ID,
		title,
		chapterNumber: chNum,
		url: `https://mangadex.org/chapter/${ch.id}`,
		dateUploaded: ch.attributes.publishAt ? new Date(ch.attributes.publishAt).getTime() : undefined,
		scanlator,
		pageCount: ch.attributes.pages || undefined,
	};
}

/**
 * Deduplicate chapters — when multiple groups upload the same chapter number,
 * keep the one with the most pages.
 */
export function deduplicateChapters(chapters: Chapter[]): Chapter[] {
	const byNumber = new Map<string, Chapter>();

	for (const ch of chapters) {
		const key = ch.chapterNumber !== undefined ? String(ch.chapterNumber) : ch.id;
		const existing = byNumber.get(key);
		if (!existing || (ch.pageCount ?? 0) > (existing.pageCount ?? 0)) {
			byNumber.set(key, ch);
		}
	}

	return Array.from(byNumber.values());
}
