/**
 * MangaDex native source — implements ContentSource for the MangaDex API.
 * Opt-in: user must enable it via the Extensions page.
 */

import type { ContentSource, SourceFilter } from '../source-interface.js';
import type { WorkEntry, Chapter, Page, PaginatedResult } from '../../types/work.js';
import { getNsfwMode } from '../settings.js';
import * as api from './mangadex-api.js';
import { mapMangaToEntry, mapChapterToOurs, deduplicateChapters } from './mangadex-utils.js';

const ITEMS_PER_PAGE = 20;
const FEED_LIMIT = 500;
const MAX_OFFSET = 10000;

export class MangaDexSource implements ContentSource {
	readonly id = 'mangadex';
	readonly name = 'MangaDex';
	readonly lang = 'en';
	readonly type = 'native' as const;
	readonly iconUrl = 'https://mangadex.org/favicon.ico';

	private get nsfwMode() {
		return getNsfwMode();
	}

	async browse(page: number, mode: 'popular' | 'latest' = 'popular'): Promise<PaginatedResult<WorkEntry>> {
		const offset = (page - 1) * ITEMS_PER_PAGE;
		const res = mode === 'latest'
			? await api.getLatest(ITEMS_PER_PAGE, offset, this.nsfwMode)
			: await api.getPopular(ITEMS_PER_PAGE, offset, this.nsfwMode);

		const items = res.data.map(mapMangaToEntry);
		const hasNextPage = offset + res.limit < res.total;
		return { items, hasNextPage, page };
	}

	async search(query: string, page: number): Promise<PaginatedResult<WorkEntry>> {
		const offset = (page - 1) * ITEMS_PER_PAGE;
		const res = await api.searchManga(query, ITEMS_PER_PAGE, offset, this.nsfwMode);
		const items = res.data.map(mapMangaToEntry);
		const hasNextPage = offset + res.limit < res.total;
		return { items, hasNextPage, page };
	}

	async getDetail(workId: string): Promise<{ work: WorkEntry; chapters: Chapter[] }> {
		const mangaRes = await api.getMangaById(workId);
		const work = mapMangaToEntry(mangaRes.data);

		// Fetch all chapters, paginating up to MAX_OFFSET
		const allChapters: Chapter[] = [];
		let offset = 0;
		let hasMore = true;

		while (hasMore && offset < MAX_OFFSET) {
			const feedRes = await api.getMangaFeed(workId, FEED_LIMIT, offset);
			const mapped = feedRes.data
				.filter((ch) => !ch.attributes.externalUrl) // skip external chapters
				.map((ch) => mapChapterToOurs(ch, workId));
			allChapters.push(...mapped);

			offset += feedRes.limit;
			hasMore = offset < feedRes.total;
		}

		return { work, chapters: deduplicateChapters(allChapters) };
	}

	async getChapterPages(chapterId: string, signal?: AbortSignal): Promise<Page[]> {
		const atHome = await api.getAtHomeServer(chapterId, signal);
		const { baseUrl, chapter } = atHome;

		return chapter.data.map((filename, index) => {
			const imageUrl = `${baseUrl}/data/${chapter.hash}/${filename}`;
			return {
				index,
				url: `/api/proxy/image?url=${encodeURIComponent(imageUrl)}&referer=${encodeURIComponent('https://mangadex.org')}`,
			};
		});
	}

	getFilters(): SourceFilter[] {
		return [];
	}
}
