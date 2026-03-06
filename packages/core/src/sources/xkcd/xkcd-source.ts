/**
 * XKCD native source — implements ContentSource for the XKCD webcomic.
 * Treats the entire XKCD archive as a single work with each comic as a chapter.
 */

import type { ContentSource, SourceFilter } from '../source-interface.js';
import type { WorkEntry, Chapter, Page, PaginatedResult } from '../../types/work.js';
import * as api from './xkcd-api.js';

function proxyUrl(url: string): string {
	return `/api/proxy/image?url=${encodeURIComponent(url)}&referer=${encodeURIComponent('https://xkcd.com')}`;
}

export class XkcdSource implements ContentSource {
	readonly id = 'xkcd';
	readonly name = 'xkcd';
	readonly lang = 'en';
	readonly type = 'native' as const;
	readonly iconUrl = 'https://xkcd.com/s/919f27.ico';

	async browse(page: number): Promise<PaginatedResult<WorkEntry>> {
		const latest = await api.getLatest();
		const entry: WorkEntry = {
			id: 'xkcd',
			sourceId: 'xkcd',
			title: 'xkcd',
			coverUrl: proxyUrl(latest.img),
			url: 'https://xkcd.com',
			author: 'Randall Munroe',
			description: 'A webcomic of romance, sarcasm, math, and language.',
			genres: ['Webcomic', 'Comedy', 'Science'],
			status: 'ongoing',
		};
		return { items: [entry], hasNextPage: false, page };
	}

	async search(query: string, page: number): Promise<PaginatedResult<WorkEntry>> {
		const num = parseInt(query, 10);
		if (!isNaN(num) && num > 0) {
			try {
				const comic = await api.getComic(num);
				const entry: WorkEntry = {
					id: 'xkcd',
					sourceId: 'xkcd',
					title: `xkcd #${comic.num}: ${comic.safe_title}`,
					coverUrl: proxyUrl(comic.img),
					url: `https://xkcd.com/${comic.num}/`,
					author: 'Randall Munroe',
				};
				return { items: [entry], hasNextPage: false, page };
			} catch {
				return { items: [], hasNextPage: false, page };
			}
		}

		// XKCD has no text search API — return the main entry if query matches
		if ('xkcd'.includes(query.toLowerCase()) || query.toLowerCase().includes('xkcd')) {
			return this.browse(page);
		}

		return { items: [], hasNextPage: false, page };
	}

	async getDetail(workId: string): Promise<{ work: WorkEntry; chapters: Chapter[] }> {
		const latest = await api.getLatest();
		const totalComics = latest.num;

		const work: WorkEntry = {
			id: 'xkcd',
			sourceId: 'xkcd',
			title: 'xkcd',
			coverUrl: proxyUrl(latest.img),
			url: 'https://xkcd.com',
			author: 'Randall Munroe',
			description: 'A webcomic of romance, sarcasm, math, and language.',
			genres: ['Webcomic', 'Comedy', 'Science'],
			status: 'ongoing',
		};

		// Generate chapter list from total count (no per-chapter API calls needed)
		const chapters: Chapter[] = [];
		for (let num = totalComics; num >= 1; num--) {
			chapters.push({
				id: String(num),
				workId: 'xkcd',
				sourceId: 'xkcd',
				title: `#${num}`,
				chapterNumber: num,
				url: `https://xkcd.com/${num}/`,
			});
		}

		return { work, chapters };
	}

	async getChapterPages(chapterId: string): Promise<Page[]> {
		const num = parseInt(chapterId, 10);
		const comic = await api.getComic(num);

		return [
			{
				index: 0,
				url: proxyUrl(comic.img),
			},
		];
	}

	getFilters(): SourceFilter[] {
		return [];
	}
}
