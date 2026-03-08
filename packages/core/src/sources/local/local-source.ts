import { readdir, stat, readFile } from 'fs/promises';
import { join, basename, extname, resolve } from 'path';
import { isImageFile, isArchiveFile, extractArchivePage, listArchivePages } from '../../archive.js';
import { db } from '../../db/client.js';
import { localLibraryPaths } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ContentSource, SourceFilter } from '../source-interface.js';
import type { WorkEntry, Chapter, Page, PaginatedResult } from '../../types/work.js';
import type { FsAdapter, DirEntry } from '../fs-adapter.js';
import {
	scanWorks as sharedScanWorks,
	getChapters as sharedGetChapters,
	getWorkDetail as sharedGetWorkDetail,
	getChapterPages as sharedGetChapterPages,
} from '../scanner.js';

function encodeId(path: string): string {
	return Buffer.from(path).toString('base64url');
}

export function decodeId(id: string): string {
	return Buffer.from(id, 'base64url').toString('utf-8');
}

// ── Local filesystem adapter ──

const localFs: FsAdapter = {
	async readdir(path: string): Promise<DirEntry[]> {
		const entries = await readdir(path, { withFileTypes: true });
		return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
	},
	readFile(path: string): Promise<Buffer> {
		return readFile(path);
	},
	join(...parts: string[]): string {
		return join(...parts);
	},
	basename(path: string, ext?: string): string {
		return basename(path, ext);
	},
	imageUrl(path: string, entry?: string): string {
		let url = `/api/local/image?path=${encodeURIComponent(path)}`;
		if (entry) url += `&entry=${encodeURIComponent(entry)}`;
		return url;
	},
	async getMtimeMs(path: string): Promise<number | undefined> {
		try {
			const info = await stat(path);
			return info.mtimeMs;
		} catch {
			return undefined;
		}
	},
};

// ── Exported scan functions (for direct use) ──

export async function scanLibraryPath(libraryPath: string, sourceId: string = 'local'): Promise<WorkEntry[]> {
	return sharedScanWorks(localFs, resolve(libraryPath), sourceId);
}

export async function getChapters(workPath: string, sourceId: string, maxDepth: number = 1, coverPageOffset: number = 0): Promise<Chapter[]> {
	return sharedGetChapters(localFs, workPath, sourceId, maxDepth, coverPageOffset);
}

export async function getPages(chapterPath: string): Promise<Page[]> {
	return sharedGetChapterPages(localFs, chapterPath);
}

// ── Image handler ──

function getMimeType(filename: string): string {
	const ext = extname(filename).toLowerCase();
	const mimeTypes: Record<string, string> = {
		'.jpg': 'image/jpeg',
		'.jpeg': 'image/jpeg',
		'.png': 'image/png',
		'.gif': 'image/gif',
		'.webp': 'image/webp',
		'.bmp': 'image/bmp',
		'.avif': 'image/avif',
	};
	return mimeTypes[ext] ?? 'application/octet-stream';
}

export async function getImage(
	filePath: string,
	entry?: string,
	pageIndex?: number
): Promise<{ data: Buffer; mimeType: string }> {
	const resolvedPath = resolve(filePath);

	if (entry) {
		const data = await extractArchivePage(resolvedPath, entry);
		return { data, mimeType: getMimeType(entry) };
	}

	if (pageIndex !== undefined && isArchiveFile(resolvedPath)) {
		const pages = await listArchivePages(resolvedPath);
		const idx = Math.min(pageIndex, pages.length - 1);
		const pageName = pages[Math.max(idx, 0)];
		const data = await extractArchivePage(resolvedPath, pageName);
		return { data, mimeType: getMimeType(pageName) };
	}

	const data = await readFile(resolvedPath);
	return { data, mimeType: getMimeType(resolvedPath) };
}

// ── DB helper ──

export function getConfiguredPaths(): { id: number; path: string; label: string | null; enabled: boolean }[] {
	return db.select().from(localLibraryPaths).where(eq(localLibraryPaths.enabled, true)).all();
}

// ── ContentSource adapter ──

export interface LocalPathConfig {
	id: number;
	path: string;
	label: string | null;
	enabled: boolean;
	sourceType: string | null;
}

export class LocalSourceAdapter implements ContentSource {
	readonly id: string;
	readonly name: string;
	readonly lang = 'en';
	readonly type = 'local' as const;
	private pathConfig: LocalPathConfig;

	constructor(config: LocalPathConfig) {
		this.pathConfig = config;
		this.id = `local:${config.id}`;
		this.name = config.label || config.path;
	}

	async browse(_page: number, _mode?: 'popular' | 'latest'): Promise<PaginatedResult<WorkEntry>> {
		try {
			const entries = await scanLibraryPath(this.pathConfig.path, this.id);
			return { items: entries, hasNextPage: false, page: 1 };
		} catch (err) {
			console.error(`Failed to scan library path ${this.pathConfig.path}:`, err);
			return { items: [], hasNextPage: false, page: 1 };
		}
	}

	async search(query: string, _page: number): Promise<PaginatedResult<WorkEntry>> {
		const { items } = await this.browse(1);
		const filtered = query
			? items.filter((m) => m.title.toLowerCase().includes(query.toLowerCase()))
			: items;
		return { items: filtered, hasNextPage: false, page: 1 };
	}

	async getDetail(workId: string, _fallbackTitle?: string, maxDepth?: number, coverPageOffset?: number): Promise<{ work: WorkEntry; chapters: Chapter[] }> {
		const workPath = decodeId(workId);
		return sharedGetWorkDetail(localFs, workPath, workId, this.id, maxDepth, coverPageOffset);
	}

	async getChapterPages(chapterId: string): Promise<Page[]> {
		const chapterPath = decodeId(chapterId);
		return getPages(chapterPath);
	}

	getFilters(): SourceFilter[] {
		return [];
	}
}
