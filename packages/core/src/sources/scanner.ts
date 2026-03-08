/**
 * Shared scanning logic for local and SMB sources.
 * All filesystem access goes through the FsAdapter interface.
 */

import { extname, basename as pathBasename } from 'path';
import {
	listArchivePagesFromBuffer,
	isImageFile, isArchiveFile, naturalSort,
} from '../archive.js';
import { parseFilename } from './local/filename-parser.js';
import { groupVariants } from './local/variant-grouper.js';
import { parseComicInfoXml, extractComicInfoFromBuffer } from './local/comicinfo-parser.js';
import { detectInternalChapters } from './local/internal-chapters.js';
import type { FsAdapter } from './fs-adapter.js';
import type { WorkEntry, Chapter, Page } from '../types/work.js';

function encodeId(path: string): string {
	return Buffer.from(path).toString('base64url');
}

// ── Meta folder helpers ──

const META_DIR = '_meta';

/** Read _meta/ entries if the folder exists, otherwise empty array. */
async function readMetaDir(fs: FsAdapter, workDir: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(fs.join(workDir, META_DIR));
		return entries.filter((e) => !e.isDirectory && !e.name.startsWith('.')).map((e) => e.name);
	} catch {
		return [];
	}
}

// ── Artwork detection ──

const ARTWORK_PATTERNS: { field: keyof Pick<WorkEntry, 'posterUrl' | 'bannerUrl' | 'logoUrl' | 'iconUrl'>; name: string }[] = [
	{ field: 'posterUrl', name: 'poster' },
	{ field: 'bannerUrl', name: 'banner' },
	{ field: 'logoUrl', name: 'logo' },
	{ field: 'iconUrl', name: 'icon' },
];

function findArtworkMatch(entries: string[], name: string): string | undefined {
	return entries.find((e) => {
		const base = e.toLowerCase();
		const dotIdx = base.lastIndexOf('.');
		if (dotIdx < 0) return false;
		return base.slice(0, dotIdx) === name && isImageFile(e);
	});
}

async function detectArtwork(fs: FsAdapter, dirEntries: string[], workDir: string, metaEntries?: string[]): Promise<Partial<Pick<WorkEntry, 'posterUrl' | 'bannerUrl' | 'logoUrl' | 'iconUrl'>>> {
	const meta = metaEntries ?? await readMetaDir(fs, workDir);
	const result: Partial<Pick<WorkEntry, 'posterUrl' | 'bannerUrl' | 'logoUrl' | 'iconUrl'>> = {};
	for (const { field, name } of ARTWORK_PATTERNS) {
		// Prefer _meta/, fall back to root
		const metaMatch = findArtworkMatch(meta, name);
		const match = metaMatch ?? findArtworkMatch(dirEntries, name);
		if (match) {
			const filePath = metaMatch
				? fs.join(workDir, META_DIR, match)
				: fs.join(workDir, match);
			let mtimeSuffix = '';
			try {
				const ms = await fs.getMtimeMs(filePath);
				if (ms != null) mtimeSuffix = `&t=${ms | 0}`;
			} catch {}
			result[field] = `${fs.imageUrl(filePath)}${mtimeSuffix}`;
		}
	}
	return result;
}

// ── Content detection ──

async function dirHasContent(fs: FsAdapter, dirPath: string): Promise<boolean> {
	const entries = await fs.readdir(dirPath);
	const hasDirectContent = entries.some(
		(e) => !e.isDirectory && !e.name.startsWith('.') && (isArchiveFile(e.name) || isImageFile(e.name))
	);
	if (hasDirectContent) return true;
	for (const e of entries) {
		if (e.isDirectory && !e.name.startsWith('.') && e.name !== META_DIR) {
			const sub = await fs.readdir(fs.join(dirPath, e.name));
			if (sub.some((s) => !s.isDirectory && !s.name.startsWith('.') && (isArchiveFile(s.name) || isImageFile(s.name)))) {
				return true;
			}
		}
	}
	return false;
}

// ── Cover detection ──

async function findCover(fs: FsAdapter, workDir: string, dirEntryNames?: string[], metaEntries?: string[]): Promise<string | undefined> {
	const names = dirEntryNames ?? (await fs.readdir(workDir)).filter((e) => !e.name.startsWith('.')).map((e) => e.name);

	// Check _meta/ first for cover.*
	const meta = metaEntries ?? await readMetaDir(fs, workDir);
	const metaCover = meta.find((n) => /^cover\./i.test(n) && isImageFile(n));
	if (metaCover) {
		return fs.imageUrl(fs.join(workDir, META_DIR, metaCover));
	}

	const coverFile = names.find((n) => /^cover\./i.test(n) && isImageFile(n));
	if (coverFile) {
		return fs.imageUrl(fs.join(workDir, coverFile));
	}

	const archives = names.filter((n) => isArchiveFile(n)).sort(naturalSort);
	if (archives.length > 0) {
		const archivePath = fs.join(workDir, archives[0]);
		try {
			const data = await fs.readFile(archivePath);
			const pages = await listArchivePagesFromBuffer(data);
			if (pages.length > 0) {
				return fs.imageUrl(archivePath, pages[0]);
			}
		} catch { /* ignore */ }
	}

	const images = names.filter((n) => isImageFile(n)).sort(naturalSort);
	if (images.length > 0) {
		return fs.imageUrl(fs.join(workDir, images[0]));
	}

	// Recurse into first subdirectory for an archive cover
	const allEntries = dirEntryNames ? undefined : await fs.readdir(workDir);
	const subdirs = (allEntries ?? (await fs.readdir(workDir)))
		.filter((e) => e.isDirectory && !e.name.startsWith('.'))
		.sort((a, b) => naturalSort(a.name, b.name));
	for (const sub of subdirs) {
		const subPath = fs.join(workDir, sub.name);
		const subNames = (await fs.readdir(subPath)).filter((e) => !e.name.startsWith('.')).map((e) => e.name);
		const subArchives = subNames.filter((n) => isArchiveFile(n)).sort(naturalSort);
		if (subArchives.length > 0) {
			try {
				const data = await fs.readFile(fs.join(subPath, subArchives[0]));
				const pages = await listArchivePagesFromBuffer(data);
				if (pages.length > 0) {
					return fs.imageUrl(fs.join(subPath, subArchives[0]), pages[0]);
				}
			} catch { /* ignore */ }
		}
	}

	return undefined;
}

function archiveCoverUrl(fs: FsAdapter, archivePath: string, pages: string[], offset: number): string | undefined {
	if (offset < 0 || pages.length === 0) return undefined;
	const idx = Math.min(offset, pages.length - 1);
	return fs.imageUrl(archivePath, pages[idx]);
}

function imageDirCoverUrl(fs: FsAdapter, dirPath: string, imageNames: string[], offset: number): string | undefined {
	if (offset < 0 || imageNames.length === 0) return undefined;
	const idx = Math.min(offset, imageNames.length - 1);
	return fs.imageUrl(fs.join(dirPath, imageNames[idx]));
}

function findExternalCover(archiveName: string, fileNames: string[]): string | undefined {
	const archiveBase = pathBasename(archiveName, extname(archiveName));
	return fileNames.find(
		(n) => isImageFile(n) && pathBasename(n, extname(n)) === archiveBase
	);
}

// ── Work scanning (browse) ──

export async function scanWorks(fs: FsAdapter, basePath: string, sourceId: string): Promise<WorkEntry[]> {
	const results: WorkEntry[] = [];

	async function scanDir(dirPath: string): Promise<void> {
		const entries = await fs.readdir(dirPath);

		for (const entry of entries) {
			if (entry.name.startsWith('.')) continue;

			const fullPath = fs.join(dirPath, entry.name);
			if (entry.isDirectory) {
				const hasContent = await dirHasContent(fs, fullPath);
				if (hasContent) {
					const dirEntries = (await fs.readdir(fullPath)).filter((e) => !e.name.startsWith('.'));
					const dirNames = dirEntries.map((e) => e.name);
					const metaEntries = await readMetaDir(fs, fullPath);
					const artwork = await detectArtwork(fs, dirNames, fullPath, metaEntries);
					const coverUrl = artwork.posterUrl ?? await findCover(fs, fullPath, dirNames, metaEntries);

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
					title: fs.basename(entry.name, extname(entry.name)),
					url: fullPath,
				});
			}
		}
	}

	await scanDir(basePath);
	results.sort((a, b) => naturalSort(a.title, b.title));
	return results;
}

// ── Chapter detection (multi-phase pipeline) ──

export async function getChapters(fs: FsAdapter, workPath: string, sourceId: string, maxDepth: number = 1, coverPageOffset: number = 0): Promise<Chapter[]> {
	const wantCover = coverPageOffset >= 0;

	// Single archive file (not a directory)
	if (isArchiveFile(workPath)) {
		const data = await fs.readFile(workPath);
		const pages = await listArchivePagesFromBuffer(data);
		return [{
			id: encodeId(workPath),
			workId: encodeId(workPath),
			sourceId,
			title: fs.basename(workPath, extname(workPath)),
			chapterNumber: 1,
			url: workPath,
			pageCount: pages.length,
			coverUrl: wantCover ? archiveCoverUrl(fs, workPath, pages, coverPageOffset) : undefined,
		}];
	}

	const workId = encodeId(workPath);
	const entries = await fs.readdir(workPath);
	const visible = entries.filter((e) => !e.name.startsWith('.')).sort((a, b) => naturalSort(a.name, b.name));

	const rootArchives = visible.filter((e) => !e.isDirectory && isArchiveFile(e.name));
	const rootImages = visible.filter((e) => !e.isDirectory && isImageFile(e.name));
	const subdirs = visible.filter((e) => e.isDirectory && e.name !== META_DIR);
	const allFileNames = visible.filter((e) => !e.isDirectory).map((e) => e.name);

	// ── Phase 1: Classify root archives ──
	const parsedArchives = rootArchives.map((e) => ({
		path: fs.join(workPath, e.name),
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
				const data = await fs.readFile(variant.path);
				const pages = await listArchivePagesFromBuffer(data);
				const externalCover = findExternalCover(fs.basename(variant.path), allFileNames);
				const coverUrl = externalCover
					? fs.imageUrl(fs.join(workPath, externalCover))
					: (wantCover ? archiveCoverUrl(fs, variant.path, pages, coverPageOffset) : undefined);

				const parsed = variant.parsed;
				const title = parsed.subtitle
					? `Vol. ${group.volumeNumber} - ${parsed.subtitle}`
					: `Vol. ${group.volumeNumber}`;

				const internalChapters = detectInternalChapters(pages);

				let chapterMeta: Chapter['metadata'] | undefined;
				try {
					const ci = await extractComicInfoFromBuffer(data);
					if (ci) {
						chapterMeta = {};
						if (ci.summary) chapterMeta.summary = ci.summary;
						if (ci.writer) chapterMeta.writer = ci.writer;
						if (ci.penciller) chapterMeta.penciller = ci.penciller;
						if (ci.publisher) chapterMeta.publisher = ci.publisher;
						if (ci.year) chapterMeta.year = ci.year;
						if (ci.genre) chapterMeta.genre = ci.genre;
						if (!chapterMeta.summary && !chapterMeta.writer && !chapterMeta.penciller &&
							!chapterMeta.publisher && !chapterMeta.year && !chapterMeta.genre) {
							chapterMeta = undefined;
						}
					}
				} catch { /* ignore */ }

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
					internalChapters: internalChapters.length > 0 ? internalChapters : undefined,
					metadata: chapterMeta,
				});
			} catch { /* skip unreadable archives */ }
		}
	}

	// ── Phase 4: Build standalone chapter entries ──
	for (const file of chapterFiles) {
		try {
			const data = await fs.readFile(file.path);
			const pages = await listArchivePagesFromBuffer(data);
			const title = `Ch. ${file.parsed.chapterNumber}`;
			chapters.push({
				id: encodeId(file.path),
				workId,
				sourceId,
				title,
				chapterNumber: file.parsed.chapterNumber!,
				url: file.path,
				pageCount: pages.length,
				coverUrl: wantCover ? archiveCoverUrl(fs, file.path, pages, coverPageOffset) : undefined,
			});
		} catch { /* skip */ }
	}

	// ── Phase 5: Build unclassified entries (auto-numbered) ──
	let autoNum = chapters.length + 1;
	for (const file of unclassified) {
		try {
			const data = await fs.readFile(file.path);
			const pages = await listArchivePagesFromBuffer(data);
			chapters.push({
				id: encodeId(file.path),
				workId,
				sourceId,
				title: fs.basename(file.name, extname(file.name)),
				chapterNumber: autoNum++,
				url: file.path,
				pageCount: pages.length,
				coverUrl: wantCover ? archiveCoverUrl(fs, file.path, pages, coverPageOffset) : undefined,
			});
		} catch { /* skip */ }
	}

	// ── Phase 7: Process subdirectories as sections ──
	const parentName = fs.basename(workPath).toLowerCase();
	for (const dir of subdirs) {
		const dirPath = fs.join(workPath, dir.name);
		const isMainContent = parentName.includes(dir.name.toLowerCase());
		const sectionName = isMainContent ? undefined : dir.name;
		const subEntries = await fs.readdir(dirPath);
		const subSorted = subEntries.filter((e) => !e.name.startsWith('.')).sort((a, b) => naturalSort(a.name, b.name));

		for (const subEntry of subSorted) {
			const subPath = fs.join(dirPath, subEntry.name);

			if (!subEntry.isDirectory && isArchiveFile(subEntry.name)) {
				try {
					const data = await fs.readFile(subPath);
					const pages = await listArchivePagesFromBuffer(data);
					const parsed = parseFilename(subEntry.name);
					const chapterNumber = parsed.chapterNumber ?? parsed.volumeNumber;

					chapters.push({
						id: encodeId(subPath),
						workId,
						sourceId,
						title: chapterNumber != null
							? `Ch. ${chapterNumber}`
							: fs.basename(subEntry.name, extname(subEntry.name)),
						chapterNumber: chapterNumber ?? autoNum++,
						section: sectionName,
						url: subPath,
						pageCount: pages.length,
						coverUrl: wantCover ? archiveCoverUrl(fs, subPath, pages, coverPageOffset) : undefined,
					});
				} catch { /* skip */ }
			} else if (subEntry.isDirectory) {
				const imgEntries = await fs.readdir(subPath);
				const imageFiles = imgEntries.filter((f) => isImageFile(f.name));
				if (imageFiles.length > 0) {
					const sortedImages = wantCover ? imageFiles.map((e) => e.name).sort(naturalSort) : undefined;
					chapters.push({
						id: encodeId(subPath),
						workId,
						sourceId,
						title: subEntry.name,
						chapterNumber: autoNum++,
						section: sectionName,
						url: subPath,
						pageCount: imageFiles.length,
						coverUrl: sortedImages ? imageDirCoverUrl(fs, subPath, sortedImages, coverPageOffset) : undefined,
					});
				}
			}
		}
	}

	// ── Phase 8: Handle root loose images ──
	if (chapters.length === 0 && rootImages.length > 0) {
		const sortedImages = wantCover ? rootImages.map((e) => e.name).sort(naturalSort) : undefined;
		chapters.push({
			id: encodeId(workPath),
			workId,
			sourceId,
			title: fs.basename(workPath),
			chapterNumber: 1,
			url: workPath,
			pageCount: rootImages.length,
			coverUrl: sortedImages ? imageDirCoverUrl(fs, workPath, sortedImages, coverPageOffset) : undefined,
		});
	}

	// Sort: volumes first by number, then sections by directory order
	chapters.sort((a, b) => {
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

// ── Work detail (enriched work entry + chapters) ──

export async function getWorkDetail(
	fs: FsAdapter,
	workPath: string,
	workId: string,
	sourceId: string,
	maxDepth?: number,
	coverPageOffset?: number,
): Promise<{ work: WorkEntry; chapters: Chapter[] }> {
	const chapterList = await getChapters(fs, workPath, sourceId, maxDepth, coverPageOffset);

	const work: WorkEntry = {
		id: workId,
		sourceId,
		title: fs.basename(workPath),
		url: workPath,
	};

	if (isArchiveFile(workPath)) {
		work.coverUrl = chapterList[0]?.coverUrl;
		work.title = fs.basename(workPath, extname(workPath));
	} else {
		const dirEntryNames = (await fs.readdir(workPath)).filter((e) => !e.name.startsWith('.')).map((e) => e.name);
		const metaEntries = await readMetaDir(fs, workPath);
		const artwork = await detectArtwork(fs, dirEntryNames, workPath, metaEntries);
		Object.assign(work, artwork);
		work.coverUrl = artwork.posterUrl ?? await findCover(fs, workPath, dirEntryNames, metaEntries);

		// ComicInfo.xml enrichment: _meta/ first, then folder-level, then first archive
		let comicInfo = await readComicInfoFromFs(fs, fs.join(workPath, META_DIR, 'ComicInfo.xml'));
		if (!comicInfo) comicInfo = await readComicInfoFromFs(fs, fs.join(workPath, 'ComicInfo.xml'));
		if (!comicInfo) {
			const firstArchive = chapterList.find((c) => isArchiveFile(c.url));
			if (firstArchive) {
				try {
					const data = await fs.readFile(firstArchive.url);
					comicInfo = await extractComicInfoFromBuffer(data);
				} catch { /* ignore */ }
			}
		}
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
	}

	return { work, chapters: chapterList };
}

async function readComicInfoFromFs(fs: FsAdapter, filePath: string) {
	try {
		const data = await fs.readFile(filePath);
		return parseComicInfoXml(data.toString('utf-8'));
	} catch {
		return null;
	}
}

// ── Chapter pages ──

export async function getChapterPages(fs: FsAdapter, chapterPath: string): Promise<Page[]> {
	if (isArchiveFile(chapterPath)) {
		const data = await fs.readFile(chapterPath);
		const pages = await listArchivePagesFromBuffer(data);
		return pages.map((name, index) => ({
			index,
			url: fs.imageUrl(chapterPath, name),
		}));
	}

	// Directory with loose images
	const entries = await fs.readdir(chapterPath);
	const images = entries
		.filter((e) => !e.isDirectory && isImageFile(e.name))
		.sort((a, b) => naturalSort(a.name, b.name));

	return images.map((entry, index) => ({
		index,
		url: fs.imageUrl(fs.join(chapterPath, entry.name)),
	}));
}
