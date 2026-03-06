import { readdir, stat, readFile } from 'fs/promises';
import { join, basename, extname, resolve } from 'path';
import {
	listArchivePages, extractArchivePage,
	isImageFile, isArchiveFile, naturalSort,
} from '../../archive.js';
import { db } from '../../db/client.js';
import { localLibraryPaths } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ContentSource, SourceFilter } from '../source-interface.js';
import type { WorkEntry, Chapter, Page, PaginatedResult } from '../../types/work.js';

function encodeId(path: string): string {
	return Buffer.from(path).toString('base64url');
}

export function decodeId(id: string): string {
	return Buffer.from(id, 'base64url').toString('utf-8');
}

/** Scan a library path for work directories/archives. */
export async function scanLibraryPath(libraryPath: string, sourceId: string = 'local'): Promise<WorkEntry[]> {
	const resolvedPath = resolve(libraryPath);
	const results: WorkEntry[] = [];

	async function scanDir(dirPath: string): Promise<void> {
		const entries = await readdir(dirPath, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.name.startsWith('.')) continue;

			const fullPath = join(dirPath, entry.name);
			if (entry.isDirectory()) {
				const hasContent = await dirHasContent(fullPath);
				if (hasContent) {
					// Directory has archives or images — it's a title
					const coverUrl = await findCover(fullPath);
					results.push({
						id: encodeId(fullPath),
						sourceId,
						title: entry.name,
						coverUrl,
						url: fullPath,
					});
				} else {
					// No content — transparent group, recurse deeper
					await scanDir(fullPath);
				}
			} else if (isArchiveFile(entry.name)) {
				results.push({
					id: encodeId(fullPath),
					sourceId,
					title: basename(entry.name, extname(entry.name)),
					url: fullPath,
				});
			}
		}
	}

	await scanDir(resolvedPath);
	results.sort((a, b) => naturalSort(a.title, b.title));
	return results;
}

/** Check if a directory has content (archives or images) directly in it. */
async function dirHasContent(dirPath: string): Promise<boolean> {
	const entries = await readdir(dirPath, { withFileTypes: true });
	return entries.some(
		(e) => e.isFile() && !e.name.startsWith('.') && (isArchiveFile(e.name) || isImageFile(e.name))
	);
}

/** Find a cover image in a work directory. */
async function findCover(workDir: string): Promise<string | undefined> {
	const entries = await readdir(workDir, { withFileTypes: true });

	const coverFile = entries.find(
		(e) => e.isFile() && /^cover\./i.test(e.name) && isImageFile(e.name)
	);
	if (coverFile) {
		return `/api/local/image?path=${encodeURIComponent(join(workDir, coverFile.name))}`;
	}

	const archives = entries
		.filter((e) => e.isFile() && isArchiveFile(e.name))
		.sort((a, b) => naturalSort(a.name, b.name));
	if (archives.length > 0) {
		const archivePath = join(workDir, archives[0].name);
		try {
			const pages = await listArchivePages(archivePath);
			if (pages.length > 0) {
				return `/api/local/image?path=${encodeURIComponent(archivePath)}&entry=${encodeURIComponent(pages[0])}`;
			}
		} catch { /* ignore */ }
	}

	const images = entries
		.filter((e) => e.isFile() && isImageFile(e.name))
		.sort((a, b) => naturalSort(a.name, b.name));
	if (images.length > 0) {
		return `/api/local/image?path=${encodeURIComponent(join(workDir, images[0].name))}`;
	}

	return undefined;
}

/** Build a local cover URL for an archive given its page list and offset. */
function archiveCoverUrl(archivePath: string, pages: string[], offset: number): string | undefined {
	if (offset < 0 || pages.length === 0) return undefined;
	const idx = Math.min(offset, pages.length - 1);
	return `/api/local/image?path=${encodeURIComponent(archivePath)}&entry=${encodeURIComponent(pages[idx])}`;
}

/** Build a local cover URL for an image directory. */
function imageDirCoverUrl(dirPath: string, imageNames: string[], offset: number): string | undefined {
	if (offset < 0 || imageNames.length === 0) return undefined;
	const idx = Math.min(offset, imageNames.length - 1);
	return `/api/local/image?path=${encodeURIComponent(join(dirPath, imageNames[idx]))}`;
}

/** List chapters for a work, optionally recursing into subdirectories. */
export async function getChapters(workPath: string, sourceId: string, maxDepth: number = 1, coverPageOffset: number = 0): Promise<Chapter[]> {
	const info = await stat(workPath);
	const wantCover = coverPageOffset >= 0;

	if (!info.isDirectory()) {
		if (!isArchiveFile(workPath)) throw new Error('Not a supported archive');
		const pages = await listArchivePages(workPath);
		return [{
			id: encodeId(workPath),
			workId: encodeId(workPath),
			sourceId,
			title: basename(workPath, extname(workPath)),
			chapterNumber: 1,
			url: workPath,
			pageCount: pages.length,
			coverUrl: wantCover ? archiveCoverUrl(workPath, pages, coverPageOffset) : undefined,
		}];
	}

	const workId = encodeId(workPath);
	const chapters: Chapter[] = [];
	let chapterNum = 1;

	async function scanDir(dirPath: string, depth: number): Promise<void> {
		const entries = await readdir(dirPath, { withFileTypes: true });
		const sorted = entries.filter((e) => !e.name.startsWith('.')).sort((a, b) => naturalSort(a.name, b.name));

		for (const entry of sorted) {
			const fullPath = join(dirPath, entry.name);
			if (entry.isDirectory()) {
				const subEntries = await readdir(fullPath);
				const imageFiles = subEntries.filter((f) => isImageFile(f));
				const imageCount = imageFiles.length;
				const hasArchives = subEntries.some((f) => isArchiveFile(f));

				if (imageCount > 0 || hasArchives) {
					if (imageCount > 0 && !hasArchives) {
						const sortedImages = wantCover ? imageFiles.sort(naturalSort) : undefined;
						chapters.push({
							id: encodeId(fullPath),
							workId: workId,
							sourceId,
							title: entry.name,
							chapterNumber: chapterNum++,
							url: fullPath,
							pageCount: imageCount,
							coverUrl: sortedImages ? imageDirCoverUrl(fullPath, sortedImages, coverPageOffset) : undefined,
						});
					} else {
						await scanDir(fullPath, depth);
					}
				} else if (depth < maxDepth) {
					await scanDir(fullPath, depth + 1);
				}
			} else if (isArchiveFile(entry.name)) {
				try {
					const pages = await listArchivePages(fullPath);
					chapters.push({
						id: encodeId(fullPath),
						workId: workId,
						sourceId,
						title: basename(entry.name, extname(entry.name)),
						chapterNumber: chapterNum++,
						url: fullPath,
						pageCount: pages.length,
						coverUrl: wantCover ? archiveCoverUrl(fullPath, pages, coverPageOffset) : undefined,
					});
				} catch { /* skip unreadable archives */ }
			}
		}
	}

	await scanDir(workPath, 1);

	if (chapters.length === 0) {
		const entries = await readdir(workPath, { withFileTypes: true });
		const images = entries.filter((e) => e.isFile() && !e.name.startsWith('.') && isImageFile(e.name));
		if (images.length > 0) {
			const sortedImages = wantCover ? images.map((e) => e.name).sort(naturalSort) : undefined;
			chapters.push({
				id: encodeId(workPath),
				workId: workId,
				sourceId,
				title: basename(workPath),
				chapterNumber: 1,
				url: workPath,
				pageCount: images.length,
				coverUrl: sortedImages ? imageDirCoverUrl(workPath, sortedImages, coverPageOffset) : undefined,
			});
		}
	}

	return chapters;
}

/** Get page list for a chapter. */
export async function getPages(chapterPath: string): Promise<Page[]> {
	const info = await stat(chapterPath);

	if (info.isDirectory()) {
		const entries = await readdir(chapterPath);
		const images = entries.filter(isImageFile).sort(naturalSort);
		return images.map((name, index) => ({
			index,
			url: `/api/local/image?path=${encodeURIComponent(join(chapterPath, name))}`,
		}));
	}

	if (!isArchiveFile(chapterPath)) throw new Error('Not a supported file type');

	const pages = await listArchivePages(chapterPath);
	return pages.map((name, index) => ({
		index,
		url: `/api/local/image?path=${encodeURIComponent(chapterPath)}&entry=${encodeURIComponent(name)}`,
	}));
}

/** Read an image file or extract from archive. */
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
		const chapters = await getChapters(workPath, this.id, maxDepth, coverPageOffset);
		return {
			work: {
				id: workId,
				sourceId: this.id,
				title: basename(workPath),
				url: workPath,
			},
			chapters,
		};
	}

	async getChapterPages(chapterId: string): Promise<Page[]> {
		const chapterPath = decodeId(chapterId);
		return getPages(chapterPath);
	}

	getFilters(): SourceFilter[] {
		return [];
	}
}
