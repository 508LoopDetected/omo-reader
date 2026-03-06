/**
 * Abstract source interface — every content source (local, native, extension)
 * implements this contract. API routes dispatch through the registry.
 */

import type { WorkEntry, Chapter, Page, PaginatedResult } from '../types/work.js';

export interface SourceFilter {
	type: 'select' | 'text' | 'checkbox' | 'sort' | 'group';
	name: string;
	state: unknown;
	values?: string[];
}

export interface ContentSource {
	readonly id: string;
	readonly name: string;
	readonly lang: string;
	readonly type: 'local' | 'native' | 'extension' | 'smb';
	readonly iconUrl?: string;

	browse(page: number, mode?: 'popular' | 'latest'): Promise<PaginatedResult<WorkEntry>>;
	search(query: string, page: number, filters?: SourceFilter[]): Promise<PaginatedResult<WorkEntry>>;
	getDetail(workId: string, fallbackTitle?: string, maxDepth?: number, coverPageOffset?: number): Promise<{ work: WorkEntry; chapters: Chapter[] }>;
	getChapterPages(chapterId: string, signal?: AbortSignal): Promise<Page[]>;
	getFilters(): SourceFilter[];
}
