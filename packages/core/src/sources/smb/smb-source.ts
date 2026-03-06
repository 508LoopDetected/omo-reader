/**
 * SMB ContentSource — reads comics from password-protected SMB network shares.
 * Mirrors the local source scanning logic but uses smbclient CLI for file I/O.
 */

import { extname, basename } from 'path';
import { smbReaddir, smbReadFile, getConnectionConfig, type SmbConnectionConfig, type SmbDirEntry } from './smb-client.js';
import {
	listArchivePagesFromBuffer, extractArchivePageFromBuffer,
	isImageFile, isArchiveFile, naturalSort,
} from '../../archive.js';
import type { ContentSource, SourceFilter } from '../source-interface.js';
import type { WorkEntry, Chapter, Page, PaginatedResult } from '../../types/work.js';

/** Join SMB path segments. Uses backslash (smbclient convention). */
function smbJoin(...parts: string[]): string {
	return parts.filter(Boolean).join('\\');
}

function encodeId(path: string): string {
	return Buffer.from(path).toString('base64url');
}

function decodeId(id: string): string {
	return Buffer.from(id, 'base64url').toString('utf-8');
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

/** Build an SMB cover URL for an archive given its page list and offset. */
function smbArchiveCoverUrl(connectionId: string, archivePath: string, pages: string[], offset: number): string | undefined {
	if (offset < 0 || pages.length === 0) return undefined;
	const idx = Math.min(offset, pages.length - 1);
	return `/api/smb/image?connectionId=${encodeURIComponent(connectionId)}&path=${encodeURIComponent(archivePath)}&entry=${encodeURIComponent(pages[idx])}`;
}

/** Build an SMB cover URL for an image directory. */
function smbImageDirCoverUrl(connectionId: string, dirPath: string, imageNames: string[], offset: number): string | undefined {
	if (offset < 0 || imageNames.length === 0) return undefined;
	const idx = Math.min(offset, imageNames.length - 1);
	const imgPath = smbJoin(dirPath, imageNames[idx]);
	return `/api/smb/image?connectionId=${encodeURIComponent(connectionId)}&path=${encodeURIComponent(imgPath)}`;
}

/** Scan a share path for work directories/archives. */
async function scanSmbPath(connectionId: string, basePath: string, sourceId: string): Promise<WorkEntry[]> {
	const entries = await smbReaddir(connectionId, basePath);
	const results: WorkEntry[] = [];

	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue;

		const fullPath = smbJoin(basePath, entry.name);
		if (entry.isDirectory) {
			// Auto-detect: if a directory has archives, it's a title.
			// If it has no archives but has subdirectories, it's a group —
			// promote each subdirectory to its own title. (A lone cover image
			// alongside subdirs doesn't make it a title.)
			const subEntries = await smbReaddir(connectionId, fullPath);
			const hasArchives = subEntries.some(
				(e) => !e.isDirectory && !e.name.startsWith('.') && isArchiveFile(e.name)
			);
			const hasSubDirs = subEntries.some(
				(e) => e.isDirectory && !e.name.startsWith('.')
			);

			if (hasArchives || !hasSubDirs) {
				const coverUrl = await findSmbCover(connectionId, fullPath);
				results.push({
					id: encodeId(fullPath),
					sourceId,
					title: entry.name,
					coverUrl,
					url: fullPath,
				});
			} else {
				// Group folder — each subdirectory becomes its own title
				for (const sub of subEntries) {
					if (sub.name.startsWith('.') || !sub.isDirectory) continue;
					const subPath = smbJoin(fullPath, sub.name);
					const coverUrl = await findSmbCover(connectionId, subPath);
					results.push({
						id: encodeId(subPath),
						sourceId,
						title: sub.name,
						coverUrl,
						url: subPath,
					});
				}
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

	results.sort((a, b) => naturalSort(a.title, b.title));
	return results;
}

/** Find a cover image in an SMB work directory. */
async function findSmbCover(connectionId: string, workDir: string): Promise<string | undefined> {
	const entries = await smbReaddir(connectionId, workDir);

	const coverFile = entries.find(
		(e) => !e.isDirectory && /^cover\./i.test(e.name) && isImageFile(e.name)
	);
	if (coverFile) {
		const coverPath = smbJoin(workDir, coverFile.name);
		return `/api/smb/image?connectionId=${encodeURIComponent(connectionId)}&path=${encodeURIComponent(coverPath)}`;
	}

	// Use first image from first chapter archive
	const archives = entries
		.filter((e) => !e.isDirectory && isArchiveFile(e.name))
		.sort((a, b) => naturalSort(a.name, b.name));
	if (archives.length > 0) {
		const archivePath = smbJoin(workDir, archives[0].name);
		try {
			const data = await smbReadFile(connectionId, archivePath);
			const pages = await listArchivePagesFromBuffer(data);
			if (pages.length > 0) {
				return `/api/smb/image?connectionId=${encodeURIComponent(connectionId)}&path=${encodeURIComponent(archivePath)}&entry=${encodeURIComponent(pages[0])}`;
			}
		} catch { /* ignore */ }
	}

	// Use first image found
	const images = entries
		.filter((e) => !e.isDirectory && isImageFile(e.name))
		.sort((a, b) => naturalSort(a.name, b.name));
	if (images.length > 0) {
		const imgPath = smbJoin(workDir, images[0].name);
		return `/api/smb/image?connectionId=${encodeURIComponent(connectionId)}&path=${encodeURIComponent(imgPath)}`;
	}

	return undefined;
}

/** List chapters for a work on SMB, optionally recursing into subdirectories. */
async function getSmbChapters(connectionId: string, workPath: string, sourceId: string, maxDepth: number = 1, coverPageOffset: number = 0): Promise<Chapter[]> {
	const wantCover = coverPageOffset >= 0;

	// Check if workPath itself is an archive
	if (isArchiveFile(workPath)) {
		const data = await smbReadFile(connectionId, workPath);
		const pages = await listArchivePagesFromBuffer(data);
		return [{
			id: encodeId(workPath),
			workId: encodeId(workPath),
			sourceId,
			title: basename(workPath, extname(workPath)),
			chapterNumber: 1,
			url: workPath,
			pageCount: pages.length,
			coverUrl: wantCover ? smbArchiveCoverUrl(connectionId, workPath, pages, coverPageOffset) : undefined,
		}];
	}

	const workId = encodeId(workPath);
	const chapters: Chapter[] = [];
	let chapterNum = 1;

	async function scanDir(dirPath: string, depth: number): Promise<void> {
		const entries = await smbReaddir(connectionId, dirPath);
		const sorted = entries.filter((e) => !e.name.startsWith('.')).sort((a, b) => naturalSort(a.name, b.name));

		for (const entry of sorted) {
			const fullPath = smbJoin(dirPath, entry.name);
			if (entry.isDirectory) {
				const subEntries = await smbReaddir(connectionId, fullPath);
				const imageFiles = subEntries.filter((e) => !e.isDirectory && isImageFile(e.name));
				const imageCount = imageFiles.length;
				const hasArchives = subEntries.some((e) => !e.isDirectory && isArchiveFile(e.name));

				if (imageCount > 0 || hasArchives) {
					if (imageCount > 0 && !hasArchives) {
						const sortedImages = wantCover ? imageFiles.map((e) => e.name).sort(naturalSort) : undefined;
						chapters.push({
							id: encodeId(fullPath),
							workId: workId,
							sourceId,
							title: entry.name,
							chapterNumber: chapterNum++,
							url: fullPath,
							pageCount: imageCount,
							coverUrl: sortedImages ? smbImageDirCoverUrl(connectionId, fullPath, sortedImages, coverPageOffset) : undefined,
						});
					} else {
						await scanDir(fullPath, depth);
					}
				} else if (depth < maxDepth) {
					await scanDir(fullPath, depth + 1);
				}
			} else if (isArchiveFile(entry.name)) {
				try {
					const data = await smbReadFile(connectionId, fullPath);
					const pages = await listArchivePagesFromBuffer(data);
					chapters.push({
						id: encodeId(fullPath),
						workId: workId,
						sourceId,
						title: basename(entry.name, extname(entry.name)),
						chapterNumber: chapterNum++,
						url: fullPath,
						pageCount: pages.length,
						coverUrl: wantCover ? smbArchiveCoverUrl(connectionId, fullPath, pages, coverPageOffset) : undefined,
					});
				} catch { /* skip unreadable archives */ }
			}
		}
	}

	await scanDir(workPath, 1);

	// If nothing was found, check for loose images in the root
	if (chapters.length === 0) {
		const entries = await smbReaddir(connectionId, workPath);
		const images = entries.filter((e) => !e.isDirectory && !e.name.startsWith('.') && isImageFile(e.name));
		if (images.length > 0) {
			const sortedImages = wantCover ? images.map((e) => e.name).sort(naturalSort) : undefined;
			chapters.push({
				id: encodeId(workPath),
				workId: workId,
				sourceId,
				title: workPath.split('\\').pop() || workPath,
				chapterNumber: 1,
				url: workPath,
				pageCount: images.length,
				coverUrl: sortedImages ? smbImageDirCoverUrl(connectionId, workPath, sortedImages, coverPageOffset) : undefined,
			});
		}
	}

	return chapters;
}

/** Get page list for a chapter on SMB. */
async function getSmbPages(connectionId: string, chapterPath: string): Promise<Page[]> {
	if (isArchiveFile(chapterPath)) {
		const data = await smbReadFile(connectionId, chapterPath);
		const pages = await listArchivePagesFromBuffer(data);
		return pages.map((name, index) => ({
			index,
			url: `/api/smb/image?connectionId=${encodeURIComponent(connectionId)}&path=${encodeURIComponent(chapterPath)}&entry=${encodeURIComponent(name)}`,
		}));
	}

	// Directory with loose images
	const entries = await smbReaddir(connectionId, chapterPath);
	const images = entries
		.filter((e) => !e.isDirectory && isImageFile(e.name))
		.sort((a, b) => naturalSort(a.name, b.name));

	return images.map((entry, index) => ({
		index,
		url: `/api/smb/image?connectionId=${encodeURIComponent(connectionId)}&path=${encodeURIComponent(smbJoin(chapterPath, entry.name))}`,
	}));
}

/** Read an image from SMB (direct file or archive entry). */
export async function getSmbImage(
	connectionId: string,
	filePath: string,
	entry?: string,
	pageIndex?: number
): Promise<{ data: Buffer; mimeType: string }> {
	if (entry) {
		const archiveData = await smbReadFile(connectionId, filePath);
		const data = await extractArchivePageFromBuffer(archiveData, entry);
		return { data, mimeType: getMimeType(entry) };
	}

	// pageIndex: list pages in archive buffer and extract the Nth one
	if (pageIndex !== undefined && isArchiveFile(filePath)) {
		const archiveData = await smbReadFile(connectionId, filePath);
		const pages = await listArchivePagesFromBuffer(archiveData);
		const idx = Math.min(pageIndex, pages.length - 1);
		const pageName = pages[Math.max(idx, 0)];
		const data = await extractArchivePageFromBuffer(archiveData, pageName);
		return { data, mimeType: getMimeType(pageName) };
	}

	const data = await smbReadFile(connectionId, filePath);
	return { data, mimeType: getMimeType(filePath) };
}

// ── ContentSource adapter ──

export class SmbSource implements ContentSource {
	readonly id: string;
	readonly name: string;
	readonly lang = 'en';
	readonly type = 'smb' as const;
	private connectionId: string;
	private basePath: string;

	constructor(config: SmbConnectionConfig) {
		this.connectionId = config.id;
		this.id = `smb:${config.id}`;
		this.name = config.label;
		this.basePath = config.path;
	}

	async browse(_page: number, _mode?: 'popular' | 'latest'): Promise<PaginatedResult<WorkEntry>> {
		const items = await scanSmbPath(this.connectionId, this.basePath, this.id);
		return { items, hasNextPage: false, page: 1 };
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
		const chapters = await getSmbChapters(this.connectionId, workPath, this.id, maxDepth, coverPageOffset);
		return {
			work: {
				id: workId,
				sourceId: this.id,
				title: workPath.split('\\').pop() || workPath,
				url: workPath,
			},
			chapters,
		};
	}

	async getChapterPages(chapterId: string): Promise<Page[]> {
		const chapterPath = decodeId(chapterId);
		return getSmbPages(this.connectionId, chapterPath);
	}

	getFilters(): SourceFilter[] {
		return [];
	}
}
