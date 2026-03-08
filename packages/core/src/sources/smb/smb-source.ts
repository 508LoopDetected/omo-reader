/**
 * SMB ContentSource — reads comics from password-protected SMB network shares.
 * Uses the shared scanner for all scanning logic; only provides SMB filesystem I/O.
 */

import { extname, basename } from 'path';
import { smbReaddir, smbReadFile, getConnectionConfig, type SmbConnectionConfig } from './smb-client.js';
import {
	listArchivePagesFromBuffer, extractArchivePageFromBuffer,
	isImageFile, isArchiveFile,
} from '../../archive.js';
import type { ContentSource, SourceFilter } from '../source-interface.js';
import type { WorkEntry, Chapter, Page, PaginatedResult } from '../../types/work.js';
import type { FsAdapter, DirEntry } from '../fs-adapter.js';
import {
	scanWorks as sharedScanWorks,
	getWorkDetail as sharedGetWorkDetail,
	getChapterPages as sharedGetChapterPages,
} from '../scanner.js';

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

// ── SMB filesystem adapter ──

function createSmbFs(connectionId: string): FsAdapter {
	return {
		async readdir(path: string): Promise<DirEntry[]> {
			const entries = await smbReaddir(connectionId, path);
			return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
		},
		readFile(path: string): Promise<Buffer> {
			return smbReadFile(connectionId, path);
		},
		join(...parts: string[]): string {
			return smbJoin(...parts);
		},
		basename(path: string, ext?: string): string {
			const name = path.split('\\').pop() || path;
			if (ext && name.endsWith(ext)) return name.slice(0, -ext.length);
			return name;
		},
		imageUrl(path: string, entry?: string): string {
			let url = `/api/smb/image?connectionId=${encodeURIComponent(connectionId)}&path=${encodeURIComponent(path)}`;
			if (entry) url += `&entry=${encodeURIComponent(entry)}`;
			return url;
		},
		async getMtimeMs(_path: string): Promise<number | undefined> {
			return undefined; // SMB doesn't expose mtime through smbclient ls
		},
	};
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
	private fs: FsAdapter;

	constructor(config: SmbConnectionConfig) {
		this.connectionId = config.id;
		this.id = `smb:${config.id}`;
		this.name = config.label;
		this.basePath = config.path;
		this.fs = createSmbFs(config.id);
	}

	async browse(_page: number, _mode?: 'popular' | 'latest'): Promise<PaginatedResult<WorkEntry>> {
		const items = await sharedScanWorks(this.fs, this.basePath, this.id);
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
		return sharedGetWorkDetail(this.fs, workPath, workId, this.id, maxDepth, coverPageOffset);
	}

	async getChapterPages(chapterId: string): Promise<Page[]> {
		const chapterPath = decodeId(chapterId);
		return sharedGetChapterPages(this.fs, chapterPath);
	}

	getFilters(): SourceFilter[] {
		return [];
	}
}
