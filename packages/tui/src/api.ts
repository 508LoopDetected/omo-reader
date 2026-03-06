/**
 * Direct API client for @omo/core — calls core functions in-process.
 *
 * Bypasses HTTP entirely for data operations.
 * The core HTTP server still runs for image serving and the reader webview.
 * getBaseUrl() returns the core server URL for those purposes.
 */

import type {
	Source, WorkEntry, Chapter, Page, PaginatedResult,
	ReadingProgress, UserLibrary, ReadingDirection, ReaderMode, CoverArtMode,
	EnrichedLibraryItem, Collection,
} from '@omo/core';
import * as core from '@omo/core';

// ── Re-export types (same as old api.ts) ──

export type { Source, WorkEntry, Chapter, Page, PaginatedResult, ReadingProgress, UserLibrary, Collection };

// ── Base URL (for image endpoints, reader webview, management raw fetch) ──

let BASE_URL = 'http://127.0.0.1:3210';

export function setBaseUrl(url: string): void {
	BASE_URL = url;
}

export function getBaseUrl(): string {
	return BASE_URL;
}

// ── Sources ──

export async function getSources(): Promise<Source[]> {
	return core.getAllSources();
}

export async function browseSource(
	sourceId: string,
	page: number = 1,
	mode: 'popular' | 'latest' = 'popular',
): Promise<PaginatedResult<WorkEntry>> {
	return core.browseSource(sourceId, page, mode);
}

export async function searchSource(
	sourceId: string,
	query: string,
	page: number = 1,
): Promise<PaginatedResult<WorkEntry>> {
	return core.searchSource(sourceId, query, page);
}

export async function getDetail(
	sourceId: string,
	workId: string,
	title?: string,
): Promise<{ work: WorkEntry; chapters: Chapter[] }> {
	const result = await core.getDetail(sourceId, workId, title);
	return { work: result.work, chapters: result.chapters };
}

export interface WorkCompositeResult {
	work: WorkEntry;
	chapters: Chapter[];
	source: Source | null;
	inLibrary: boolean;
	libraryId: string | null;
	progressMap: Record<string, { page: number; totalPages: number }>;
	readCount: number;
	userLibraries: UserLibrary[];
	collections: Collection[];
	titleCollectionIds: string[];
	readerSettings: { direction: string | null; offset: string | null; coverArtMode: string | null };
}

export async function getWorkComposite(
	sourceId: string,
	workId: string,
	title?: string,
): Promise<WorkCompositeResult> {
	return core.getWorkComposite(sourceId, workId, title) as Promise<WorkCompositeResult>;
}

export async function getChapterPages(
	sourceId: string,
	chapterId: string,
): Promise<Page[]> {
	return core.getChapterPages(sourceId, chapterId);
}

// ── Search (global) ──

interface SearchAllResult {
	results: Array<{ source: Source; items: WorkEntry[]; hasNextPage: boolean }>;
}

export async function searchAll(
	query: string,
	page: number = 1,
): Promise<SearchAllResult> {
	const results = await core.searchAllSources(query, page);
	return { results };
}

// ── Home ──

export interface ContinueReadingItem {
	sourceId: string;
	workId: string;
	chapterId: string;
	page: number;
	totalPages: number;
	updatedAt: string;
	title?: string;
	coverUrl?: string;
	nsfw?: boolean;
}

export interface HomeData {
	continueReading: ContinueReadingItem[];
	recentLibrary: EnrichedLibraryEntry[];
}

export async function getHome(nsfwMode?: string): Promise<HomeData> {
	return core.getHomeData(nsfwMode) as unknown as HomeData;
}

// ── Library ──

export interface LibraryEntry {
	id: number;
	sourceId: string;
	workId: string;
	title: string;
	coverUrl?: string;
	url: string;
	author?: string;
	artist?: string;
	description?: string;
	genres?: string;
	status?: string;
	nsfw?: boolean;
	addedAt?: string;
	lastReadAt?: string;
}

export interface EnrichedLibraryEntry extends LibraryEntry {
	unreadCount: number;
	libraryId?: string | null;
}

export async function getLibrary(): Promise<LibraryEntry[]> {
	return core.getRawLibrary() as unknown as LibraryEntry[];
}

export async function getLibraryEnriched(opts?: {
	libraryId?: string;
	sort?: string;
	search?: string;
	nsfwMode?: string;
}): Promise<EnrichedLibraryEntry[]> {
	return core.queryLibrary({
		libraryId: opts?.libraryId,
		sort: (opts?.sort as 'title' | 'recent' | 'added') ?? undefined,
		search: opts?.search,
		nsfwMode: opts?.nsfwMode,
	}) as unknown as EnrichedLibraryEntry[];
}

export async function addToLibrary(work: WorkEntry, libraryId?: string): Promise<{ success: boolean }> {
	core.addToLibrary({
		sourceId: work.sourceId,
		workId: work.id,
		title: work.title,
		coverUrl: work.coverUrl,
		url: work.url,
		author: work.author,
		artist: work.artist,
		description: work.description,
		genres: work.genres,
		status: work.status,
		nsfw: work.nsfw,
		libraryId,
	});
	return { success: true };
}

export async function removeFromLibrary(
	sourceId: string,
	workId: string,
): Promise<{ success: boolean }> {
	core.removeFromLibrary(sourceId, workId);
	return { success: true };
}

export async function updateLibraryItem(
	sourceId: string,
	workId: string,
	updates: { libraryId?: string | null },
): Promise<{ success: boolean }> {
	core.updateLibraryEntry(sourceId, workId, updates);
	return { success: true };
}

export async function bulkAddToLibrary(
	sourceId: string,
	libraryId?: string,
): Promise<{ success: boolean; added: number; skipped: number }> {
	const result = await core.bulkAddFromSource(sourceId, libraryId);
	return { success: true, ...result };
}

// ── User Libraries ──

export async function getUserLibraries(): Promise<UserLibrary[]> {
	return core.getAllUserLibraries();
}

export async function createUserLibrary(
	name: string,
	type: 'manga' | 'western' | 'webcomic',
): Promise<{ success: boolean; id: string }> {
	const id = core.createUserLibrary(name, type);
	return { success: true, id };
}

export async function updateUserLibrary(
	id: string,
	updates: {
		name?: string;
		type?: 'manga' | 'western' | 'webcomic';
		sortOrder?: number;
		readerDirection?: string | null;
		readerOffset?: string | null;
		coverArtMode?: string | null;
	},
): Promise<{ success: boolean }> {
	core.updateUserLibrary(id, updates);
	return { success: true };
}

export async function deleteUserLibrary(id: string): Promise<{ success: boolean }> {
	core.deleteUserLibrary(id);
	return { success: true };
}

// ── Reader Settings ──

export async function getReaderSettings(
	sourceId: string,
	workId: string,
): Promise<{ direction: ReadingDirection; offset: boolean; mode: ReaderMode; coverArtMode: CoverArtMode }> {
	return core.getReaderSettings(sourceId, workId) as unknown as { direction: ReadingDirection; offset: boolean; mode: ReaderMode; coverArtMode: CoverArtMode };
}

export async function saveReaderSettings(
	sourceId: string,
	workId: string,
	settings: { direction?: ReadingDirection | null; offset?: boolean | null; coverArtMode?: CoverArtMode | null },
): Promise<{ success: boolean }> {
	core.saveReaderSettings(sourceId, workId, {
		direction: settings.direction,
		offset: settings.offset === null || settings.offset === undefined ? settings.offset : String(settings.offset),
		coverArtMode: settings.coverArtMode,
	});
	return { success: true };
}

// ── App Settings ──

export async function getAppSettings(): Promise<Record<string, string>> {
	return core.getAppSettings();
}

export async function saveAppSettings(settings: Record<string, string>): Promise<{ success: boolean }> {
	core.saveAppSettings(settings);
	return { success: true };
}

// ── Collections (cross-library) ──

export async function getCollections(): Promise<Collection[]> {
	return core.getAllCollections() as unknown as Collection[];
}

export async function createCollection(
	name: string,
): Promise<{ success: boolean; id: string }> {
	const id = core.createCollection(name);
	return { success: true, id };
}

export async function updateCollection(
	id: string,
	updates: {
		name?: string;
		sortOrder?: number;
		readerDirection?: string | null;
		readerOffset?: string | null;
		coverArtMode?: string | null;
	},
): Promise<{ success: boolean }> {
	core.updateCollection(id, updates);
	return { success: true };
}

export async function deleteCollection(id: string): Promise<{ success: boolean }> {
	core.deleteCollection(id);
	return { success: true };
}

// ── Collection Items ──

export async function getCollectionItems(collectionId: string): Promise<unknown[]> {
	return core.getCollectionItemsRaw(collectionId);
}

export async function getCollectionEnriched(
	collectionId: string,
	opts?: { sort?: string; search?: string; nsfwMode?: string },
): Promise<EnrichedLibraryEntry[]> {
	return core.queryCollectionItems(collectionId, {
		sort: (opts?.sort as 'title' | 'recent' | 'added') ?? undefined,
		search: opts?.search,
		nsfwMode: opts?.nsfwMode,
	}) as unknown as EnrichedLibraryEntry[];
}

export async function getItemCollections(sourceId: string, workId: string): Promise<string[]> {
	return core.getCollectionIdsForWork(sourceId, workId);
}

export async function addToCollection(
	collectionId: string,
	sourceId: string,
	workId: string,
): Promise<{ success: boolean }> {
	core.addToCollection(collectionId, sourceId, workId);
	return { success: true };
}

export async function removeFromCollection(
	collectionId: string,
	sourceId: string,
	workId: string,
): Promise<{ success: boolean }> {
	core.removeFromCollection(collectionId, sourceId, workId);
	return { success: true };
}

// ── Local Paths ──

export interface LocalPath {
	id: number;
	path: string;
	label: string | null;
	enabled: boolean;
	sourceType: string;
}

export async function getLocalPaths(): Promise<LocalPath[]> {
	return core.getLocalPaths() as unknown as LocalPath[];
}

export async function addLocalPath(data: {
	path: string;
	label?: string;
	sourceType?: string;
}): Promise<LocalPath> {
	return core.addLocalPath(data) as unknown as LocalPath;
}

export async function updateLocalPath(id: number | string, data: Record<string, string>): Promise<{ success: boolean }> {
	core.updateLocalPath(typeof id === 'string' ? parseInt(id) : id, data);
	return { success: true };
}

export async function deleteLocalPath(id: number | string): Promise<{ success: boolean }> {
	core.deleteLocalPath(typeof id === 'string' ? parseInt(id) : id);
	return { success: true };
}

// ── SMB ──

export interface SmbConnection {
	id: string;
	label: string;
	host: string;
	share: string;
	path: string;
	domain: string;
	username: string;
	password: string;
	enabled: boolean;
	sourceType: string;
}

export async function getSmbConnections(): Promise<SmbConnection[]> {
	return core.getSmbConnections() as unknown as SmbConnection[];
}

export async function addSmbConnection(data: Record<string, string>): Promise<SmbConnection> {
	return core.addSmbConnection(data as unknown as Parameters<typeof core.addSmbConnection>[0]) as unknown as SmbConnection;
}

export async function updateSmbConnection(id: string, data: Record<string, string>): Promise<{ success: boolean }> {
	core.updateSmbConnection(id, data);
	return { success: true };
}

export async function deleteSmbConnection(id: string): Promise<{ success: boolean }> {
	core.deleteSmbConnection(id);
	return { success: true };
}

export async function testSmbConnection(data: Record<string, string>): Promise<{ connected: boolean; error?: string }> {
	return core.testSmbConnectionRaw(data as unknown as Parameters<typeof core.testSmbConnectionRaw>[0]);
}

// ── Extension Repos ──

export interface ExtensionRepo {
	id: number;
	name: string;
	url: string;
	enabled: boolean;
}

export async function getExtensionRepos(): Promise<ExtensionRepo[]> {
	return core.getExtensionRepos() as unknown as ExtensionRepo[];
}

export async function addExtensionRepo(name: string, url: string): Promise<ExtensionRepo> {
	return core.addExtensionRepo(name, url) as unknown as ExtensionRepo;
}

export async function deleteExtensionRepo(id: number | string): Promise<{ success: boolean }> {
	core.deleteExtensionRepo(typeof id === 'string' ? parseInt(id) : id);
	return { success: true };
}

// ── Extensions ──

export interface AvailableExtension {
	id: string;
	name: string;
	lang: string;
	baseUrl: string;
	iconUrl: string;
	version: string;
	sourceCodeUrl: string;
	apiUrl: string;
	isNsfw: boolean;
	installed: boolean;
}

export async function getExtensions(): Promise<AvailableExtension[]> {
	return core.fetchExtensionIndex() as Promise<AvailableExtension[]>;
}

export async function installExtension(ext: AvailableExtension): Promise<{ success: boolean }> {
	await core.installExtension(ext as Parameters<typeof core.installExtension>[0]);
	core.clearRuntimeCache(ext.id);
	return { success: true };
}

export async function uninstallExtension(sourceId: string): Promise<{ success: boolean }> {
	await core.uninstallExtension(sourceId);
	core.clearRuntimeCache(sourceId);
	return { success: true };
}

// ── Cache ──

export async function getCacheStats(): Promise<{ totalSize: number; totalCount: number }> {
	return core.getThumbnailStats();
}

export async function clearCache(): Promise<{ success: boolean }> {
	await core.clearAllThumbnails();
	return { success: true };
}

// ── Reset ──

export async function resetAll(): Promise<{ success: boolean }> {
	await core.resetAll();
	return { success: true };
}

// ── Progress ──

export async function getProgress(
	sourceId: string,
	workId: string,
): Promise<ReadingProgress[]> {
	const rows = core.getWorkProgress(sourceId, workId);
	return rows.map((r) => ({
		workId: r.workId,
		sourceId: r.sourceId,
		chapterId: r.chapterId,
		page: r.page,
		totalPages: r.totalPages,
		updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : 0,
	}));
}

export async function saveProgress(
	sourceId: string,
	workId: string,
	chapterId: string,
	page: number,
	totalPages?: number,
): Promise<{ success: boolean }> {
	core.saveProgress(sourceId, workId, chapterId, page, totalPages ?? 0);
	return { success: true };
}

export async function markChapter(
	sourceId: string,
	workId: string,
	chapterId: string,
	read: boolean,
): Promise<{ success: boolean }> {
	core.markChapter(sourceId, workId, chapterId, read);
	return { success: true };
}
