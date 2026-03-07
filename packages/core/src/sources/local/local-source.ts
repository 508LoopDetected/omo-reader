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
import { parseFilename } from './filename-parser.js';
import { groupVariants } from './variant-grouper.js';
import { extractComicInfo } from './comicinfo-parser.js';

function encodeId(path: string): string {
	return Buffer.from(path).toString('base64url');
}

export function decodeId(id: string): string {
	return Buffer.from(id, 'base64url').toString('utf-8');
}

// ── Artwork detection ──

const ARTWORK_PATTERNS: { field: keyof Pick<WorkEntry, 'posterUrl' | 'bannerUrl' | 'logoUrl' | 'iconUrl'>; name: string }[] = [
	{ field: 'posterUrl', name: 'poster' },
	{ field: 'bannerUrl', name: 'banner' },
	{ field: 'logoUrl', name: 'logo' },
	{ field: 'iconUrl', name: 'icon' },
];

function detectArtwork(dirEntries: string[], workDir: string): Partial<Pick<WorkEntry, 'posterUrl' | 'bannerUrl' | 'logoUrl' | 'iconUrl'>> {
	const result: Partial<Pick<WorkEntry, 'posterUrl' | 'bannerUrl' | 'logoUrl' | 'iconUrl'>> = {};
	for (const { field, name } of ARTWORK_PATTERNS) {
		const match = dirEntries.find(
			(e) => {
				const base = e.toLowerCase();
				const dotIdx = base.lastIndexOf('.');
				if (dotIdx < 0) return false;
				return base.slice(0, dotIdx) === name && isImageFile(e);
			}
		);
		if (match) {
			result[field] = `/api/local/image?path=${encodeURIComponent(join(workDir, match))}`;
		}
	}
	return result;
}

/** Check if a directory has content (archives, images, or subdirectories with content). */
async function dirHasContent(dirPath: string): Promise<boolean> {
	const entries = await readdir(dirPath, { withFileTypes: true });
	const hasDirectContent = entries.some(
		(e) => e.isFile() && !e.name.startsWith('.') && (isArchiveFile(e.name) || isImageFile(e.name))
	);
	if (hasDirectContent) return true;
	// Check subdirectories for content
	for (const e of entries) {
		if (e.isDirectory() && !e.name.startsWith('.')) {
			const sub = await readdir(join(dirPath, e.name), { withFileTypes: true });
			if (sub.some((s) => s.isFile() && !s.name.startsWith('.') && (isArchiveFile(s.name) || isImageFile(s.name)))) {
				return true;
			}
		}
	}
	return false;
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
					const dirEntries = (await readdir(fullPath)).filter((e) => !e.startsWith('.'));
					const artwork = detectArtwork(dirEntries, fullPath);
					const coverUrl = artwork.posterUrl ?? await findCover(fullPath, dirEntries);

					results.push({
						id: encodeId(fullPath),
						sourceId,
						title: entry.name,
						coverUrl,
						url: fullPath,
						...artwork,
					});
				} else {
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

/** Find a cover image in a work directory. */
async function findCover(workDir: string, dirEntryNames?: string[]): Promise<string | undefined> {
	const names = dirEntryNames ?? (await readdir(workDir)).filter((e) => !e.startsWith('.'));

	// Check for cover.* file
	const coverFile = names.find((n) => /^cover\./i.test(n) && isImageFile(n));
	if (coverFile) {
		return `/api/local/image?path=${encodeURIComponent(join(workDir, coverFile))}`;
	}

	// First archive's first page
	const archives = names.filter((n) => isArchiveFile(n)).sort(naturalSort);
	if (archives.length > 0) {
		const archivePath = join(workDir, archives[0]);
		try {
			const pages = await listArchivePages(archivePath);
			if (pages.length > 0) {
				return `/api/local/image?path=${encodeURIComponent(archivePath)}&entry=${encodeURIComponent(pages[0])}`;
			}
		} catch { /* ignore */ }
	}

	// First loose image
	const images = names.filter((n) => isImageFile(n)).sort(naturalSort);
	if (images.length > 0) {
		return `/api/local/image?path=${encodeURIComponent(join(workDir, images[0]))}`;
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

/** Find an external cover image matching an archive filename. */
function findExternalCover(archiveName: string, fileNames: string[]): string | undefined {
	const archiveBase = basename(archiveName, extname(archiveName));
	return fileNames.find(
		(n) => isImageFile(n) && basename(n, extname(n)) === archiveBase
	);
}

/** List chapters for a work using multi-phase pipeline. */
export async function getChapters(workPath: string, sourceId: string, maxDepth: number = 1, coverPageOffset: number = 0): Promise<Chapter[]> {
	const info = await stat(workPath);
	const wantCover = coverPageOffset >= 0;

	// Single archive file (not a directory)
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
	const entries = await readdir(workPath, { withFileTypes: true });
	const visible = entries.filter((e) => !e.name.startsWith('.')).sort((a, b) => naturalSort(a.name, b.name));

	// Separate into categories
	const rootArchives = visible.filter((e) => e.isFile() && isArchiveFile(e.name));
	const rootImages = visible.filter((e) => e.isFile() && isImageFile(e.name));
	const subdirs = visible.filter((e) => e.isDirectory());
	const allFileNames = visible.filter((e) => e.isFile()).map((e) => e.name);

	// ── Phase 1: Classify root archives ──
	const parsedArchives = rootArchives.map((e) => ({
		path: join(workPath, e.name),
		name: e.name,
		parsed: parseFilename(e.name),
	}));

	// ── Phase 2: Group variants ──
	const volumeFiles = parsedArchives.filter((a) => a.parsed.volumeNumber != null);
	const chapterFiles = parsedArchives.filter((a) => a.parsed.volumeNumber == null && a.parsed.chapterNumber != null);
	const unclassified = parsedArchives.filter((a) => a.parsed.volumeNumber == null && a.parsed.chapterNumber == null);

	const variantGroups = groupVariants(volumeFiles);

	const chapters: Chapter[] = [];

	// ── Phase 3: Build volume chapters from variant groups ──
	for (const group of variantGroups) {
		for (const variant of group.variants) {
			try {
				const pages = await listArchivePages(variant.path);
				const externalCover = findExternalCover(basename(variant.path), allFileNames);
				const coverUrl = externalCover
					? `/api/local/image?path=${encodeURIComponent(join(workPath, externalCover))}`
					: (wantCover ? archiveCoverUrl(variant.path, pages, coverPageOffset) : undefined);

				const parsed = variant.parsed;
				const title = parsed.subtitle
					? `Vol. ${group.volumeNumber} - ${parsed.subtitle}`
					: `Vol. ${group.volumeNumber}`;

				chapters.push({
					id: encodeId(variant.path),
					workId,
					sourceId,
					title,
					chapterNumber: group.volumeNumber,
					volumeNumber: group.volumeNumber,
					variant: variant.label || undefined,
					url: variant.path,
					pageCount: pages.length,
					coverUrl,
				});
			} catch { /* skip unreadable archives */ }
		}
	}

	// ── Phase 4: Build standalone chapter entries ──
	for (const file of chapterFiles) {
		try {
			const pages = await listArchivePages(file.path);
			chapters.push({
				id: encodeId(file.path),
				workId,
				sourceId,
				title: `Ch. ${file.parsed.chapterNumber}`,
				chapterNumber: file.parsed.chapterNumber,
				url: file.path,
				pageCount: pages.length,
				coverUrl: wantCover ? archiveCoverUrl(file.path, pages, coverPageOffset) : undefined,
			});
		} catch { /* skip */ }
	}

	// ── Phase 5: Build unclassified entries (auto-numbered) ──
	let autoNum = chapters.length + 1;
	for (const file of unclassified) {
		try {
			const pages = await listArchivePages(file.path);
			chapters.push({
				id: encodeId(file.path),
				workId,
				sourceId,
				title: basename(file.name, extname(file.name)),
				chapterNumber: autoNum++,
				url: file.path,
				pageCount: pages.length,
				coverUrl: wantCover ? archiveCoverUrl(file.path, pages, coverPageOffset) : undefined,
			});
		} catch { /* skip */ }
	}

	// ── Phase 7: Process subdirectories as sections ──
	for (const dir of subdirs) {
		const dirPath = join(workPath, dir.name);
		const sectionName = dir.name;
		const subEntries = await readdir(dirPath, { withFileTypes: true });
		const subSorted = subEntries.filter((e) => !e.name.startsWith('.')).sort((a, b) => naturalSort(a.name, b.name));

		// Subdirectory cover (for Ongoing/ sections)
		const subDirCoverFile = subSorted.find((e) => e.isFile() && /^cover\./i.test(e.name) && isImageFile(e.name));

		for (const subEntry of subSorted) {
			const subPath = join(dirPath, subEntry.name);

			if (subEntry.isFile() && isArchiveFile(subEntry.name)) {
				try {
					const pages = await listArchivePages(subPath);
					const parsed = parseFilename(subEntry.name);
					const chapterNumber = parsed.chapterNumber ?? parsed.volumeNumber;

					chapters.push({
						id: encodeId(subPath),
						workId,
						sourceId,
						title: chapterNumber != null
							? `Ch. ${chapterNumber}`
							: basename(subEntry.name, extname(subEntry.name)),
						chapterNumber: chapterNumber ?? autoNum++,
						section: sectionName,
						url: subPath,
						pageCount: pages.length,
						coverUrl: wantCover ? archiveCoverUrl(subPath, pages, coverPageOffset) : undefined,
					});
				} catch { /* skip */ }
			} else if (subEntry.isDirectory()) {
				// Image directory as chapter
				const imgEntries = await readdir(subPath);
				const imageFiles = imgEntries.filter((f) => isImageFile(f));
				if (imageFiles.length > 0) {
					const sortedImages = wantCover ? imageFiles.sort(naturalSort) : undefined;
					chapters.push({
						id: encodeId(subPath),
						workId,
						sourceId,
						title: subEntry.name,
						chapterNumber: autoNum++,
						section: sectionName,
						url: subPath,
						pageCount: imageFiles.length,
						coverUrl: sortedImages ? imageDirCoverUrl(subPath, sortedImages, coverPageOffset) : undefined,
					});
				}
			}
		}
	}

	// ── Phase 8: Handle root loose images (no archives, no subdirs with content) ──
	if (chapters.length === 0 && rootImages.length > 0) {
		const sortedImages = wantCover ? rootImages.map((e) => e.name).sort(naturalSort) : undefined;
		chapters.push({
			id: encodeId(workPath),
			workId,
			sourceId,
			title: basename(workPath),
			chapterNumber: 1,
			url: workPath,
			pageCount: rootImages.length,
			coverUrl: sortedImages ? imageDirCoverUrl(workPath, sortedImages, coverPageOffset) : undefined,
		});
	}

	// Sort: volumes first by number, then sections by directory order
	chapters.sort((a, b) => {
		// Unsectioned (root) chapters come first
		const sA = a.section ?? '';
		const sB = b.section ?? '';
		if (sA !== sB) {
			if (sA === '') return -1;
			if (sB === '') return 1;
			return naturalSort(sA, sB);
		}
		return (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0);
	});

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

		// Build work entry with artwork detection
		const workInfo = await stat(workPath);
		const work: WorkEntry = {
			id: workId,
			sourceId: this.id,
			title: basename(workPath),
			url: workPath,
		};

		if (workInfo.isDirectory()) {
			const dirEntryNames = (await readdir(workPath)).filter((e) => !e.startsWith('.'));
			const artwork = detectArtwork(dirEntryNames, workPath);
			Object.assign(work, artwork);
			if (artwork.posterUrl) work.coverUrl = artwork.posterUrl;

			// ComicInfo.xml enrichment from first volume/archive
			const firstArchive = chapters.find((c) => isArchiveFile(c.url));
			if (firstArchive) {
				try {
					const comicInfo = await extractComicInfo(firstArchive.url);
					if (comicInfo) {
						if (comicInfo.writer) work.author = comicInfo.writer;
						if (comicInfo.summary) work.description = comicInfo.summary;
						if (comicInfo.genre) work.genres = comicInfo.genre.split(',').map((g) => g.trim());
						work.metadata = {};
						if (comicInfo.publisher) work.metadata.publisher = comicInfo.publisher;
						if (comicInfo.year) work.metadata.year = comicInfo.year;
						if (comicInfo.languageISO) work.metadata.language = comicInfo.languageISO;
						if (comicInfo.manga != null) work.metadata.isManga = comicInfo.manga;
						if (!work.metadata.publisher && !work.metadata.year && !work.metadata.language && work.metadata.isManga == null) {
							delete work.metadata;
						}
					}
				} catch { /* ignore */ }
			}
		}

		return { work, chapters };
	}

	async getChapterPages(chapterId: string): Promise<Page[]> {
		const chapterPath = decodeId(chapterId);
		return getPages(chapterPath);
	}

	getFilters(): SourceFilter[] {
		return [];
	}
}
