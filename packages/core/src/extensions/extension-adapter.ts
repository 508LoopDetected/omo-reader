/**
 * Extension source adapter — wraps the Mangayomi extension executor
 * into the ContentSource interface for unified dispatch.
 */

import type { ContentSource, SourceFilter } from '../sources/source-interface.js';
import type { WorkEntry, Chapter, Page, PaginatedResult } from '../types/work.js';
import type { ExtensionSourceMeta } from './runtime.js';
import { getOrCreateRuntime, extGetPopular, extGetLatest, extSearch, extGetDetail, extGetPageList } from './executor.js';
import { getExtensionById } from './loader.js';
import { db } from '../db/client.js';
import { library } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export class ExtensionSourceAdapter implements ContentSource {
	readonly id: string;
	readonly name: string;
	readonly lang: string;
	readonly type = 'extension' as const;
	readonly iconUrl?: string;

	private readonly baseUrl: string;

	constructor(ext: { id: string; name: string; lang: string; iconUrl?: string | null; baseUrl?: string | null }) {
		this.id = ext.id;
		this.name = ext.name;
		this.lang = ext.lang;
		this.iconUrl = ext.iconUrl ?? undefined;
		this.baseUrl = ext.baseUrl ?? '';
	}

	private getRuntime() {
		const ext = getExtensionById(this.id);
		if (!ext || !ext.jsCode) {
			throw new Error(`Extension not found or has no code: ${this.id}`);
		}

		const meta: ExtensionSourceMeta = {
			id: ext.id,
			name: ext.name,
			baseUrl: ext.baseUrl ?? '',
			lang: ext.lang,
			apiUrl: '',
			isFullData: false,
			hasCloudflare: false,
			dateFormat: '',
			dateFormatLocale: '',
			additionalParams: '',
			notes: '',
		};

		// Try to extract metadata from mangayomiSources constant
		try {
			const match = ext.jsCode.match(/const\s+mangayomiSources\s*=\s*(\[[\s\S]*?\]);/);
			if (match) {
				const parsed = JSON.parse(match[1]);
				if (Array.isArray(parsed) && parsed.length > 0) {
					const src = parsed[0];
					meta.apiUrl = src.apiUrl ?? '';
					meta.isFullData = src.isFullData ?? false;
					meta.hasCloudflare = src.hasCloudflare ?? false;
					meta.dateFormat = src.dateFormat ?? '';
					meta.dateFormatLocale = src.dateFormatLocale ?? '';
					meta.additionalParams = src.additionalParams ?? '';
					meta.notes = src.notes ?? '';
				}
			}
		} catch { /* ignore parse errors */ }

		return {
			runtime: getOrCreateRuntime(this.id, ext.jsCode, meta),
			baseUrl: ext.baseUrl ?? '',
		};
	}

	async browse(page: number, mode: 'popular' | 'latest' = 'popular'): Promise<PaginatedResult<WorkEntry>> {
		const { runtime } = this.getRuntime();
		return mode === 'latest'
			? extGetLatest(runtime, this.id, page)
			: extGetPopular(runtime, this.id, page);
	}

	async search(query: string, page: number, filters?: SourceFilter[]): Promise<PaginatedResult<WorkEntry>> {
		const { runtime } = this.getRuntime();
		return extSearch(runtime, this.id, query, page, (filters as unknown[]) ?? []);
	}

	async getDetail(workId: string, fallbackTitle?: string): Promise<{ work: WorkEntry; chapters: Chapter[] }> {
		const { runtime } = this.getRuntime();
		const workUrl = Buffer.from(workId, 'base64url').toString('utf-8');

		// Check library for a stored title as fallback
		if (!fallbackTitle) {
			const libEntry = db.select({ title: library.title })
				.from(library)
				.where(and(eq(library.sourceId, this.id), eq(library.workId, workId)))
				.get();
			if (libEntry && libEntry.title !== 'Unknown') {
				fallbackTitle = libEntry.title;
			}
		}

		return extGetDetail(runtime, this.id, workUrl, fallbackTitle);
	}

	async getChapterPages(chapterId: string): Promise<Page[]> {
		const { runtime, baseUrl } = this.getRuntime();
		const chapterUrl = Buffer.from(chapterId, 'base64url').toString('utf-8');
		return extGetPageList(runtime, chapterUrl, baseUrl);
	}

	getFilters(): SourceFilter[] {
		const { runtime } = this.getRuntime();
		return runtime.getFilterList() as SourceFilter[];
	}
}
