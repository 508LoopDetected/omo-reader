/**
 * Source manager — thin dispatch layer over the source registry.
 *
 * Resolves sources by ID: checks the registry first, then falls back to
 * local paths, SMB connections, and extension adapters.
 *
 * Native sources (MangaDex, xkcd) are opt-in: seeded into the DB during
 * initialization but disabled by default. Users enable them via the UI.
 */

import { registry } from './source-registry.js';
import { LocalSourceAdapter, decodeId, getConfiguredPaths } from './local/local-source.js';
import type { LocalPathConfig } from './local/local-source.js';
import { MangaDexSource } from './mangadex/mangadex-source.js';
import { XkcdSource } from './xkcd/xkcd-source.js';
import { ExtensionSourceAdapter } from '../extensions/extension-adapter.js';
import { getInstalledExtensions } from '../extensions/loader.js';
import { clearRuntimeCache } from '../extensions/executor.js';
import { clearAtHomeCache } from './mangadex/mangadex-api.js';
import { SmbSource } from './smb/smb-source.js';
import { getAllConnections, getConnectionConfig, getConnectionState, refreshConnectionState, closeAll as closeSmbClients } from './smb/smb-client.js';
import { getNsfwMode } from './settings.js';
import { db } from '../db/client.js';
import { sources as sourcesTable, library as libraryTable, userLibraries, collections, collectionItems, smbConnections, localLibraryPaths, appSettings } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { NsfwMode } from './settings.js';
import type { ContentSource, SourceFilter } from './source-interface.js';
import type { Source, WorkEntry, Chapter, Page, PaginatedResult, ReaderMode, ReadingDirection, CoverArtMode } from '../types/work.js';
import type { LibraryType } from '../types/work.js';

// ── Built-in native source definitions ──

interface NativeSourceDef {
	id: string;
	name: string;
	lang: string;
	iconUrl?: string;
	factory: () => ContentSource;
}

const NATIVE_SOURCES: NativeSourceDef[] = [
	{ id: 'mangadex', name: 'MangaDex', lang: 'en', factory: () => new MangaDexSource() },
	{ id: 'xkcd', name: 'xkcd', lang: 'en', factory: () => new XkcdSource() },
];

/**
 * Seed the `sources` table with built-in native sources (disabled by default).
 * Called once during initialization. Existing rows are not overwritten.
 */
export function seedNativeSources(): void {
	for (const def of NATIVE_SOURCES) {
		const existing = db.select().from(sourcesTable).where(eq(sourcesTable.id, def.id)).get();
		if (!existing) {
			db.insert(sourcesTable).values({
				id: def.id,
				name: def.name,
				lang: def.lang,
				type: 'native',
				iconUrl: def.iconUrl ?? null,
				enabled: false,
			}).run();
		}
	}
}

/**
 * Register enabled native sources into the runtime registry.
 * Called during initialization after the DB is ready.
 */
export function registerEnabledNativeSources(): void {
	const enabled = db.select().from(sourcesTable)
		.where(and(eq(sourcesTable.type, 'native'), eq(sourcesTable.enabled, true)))
		.all();

	const enabledIds = new Set(enabled.map(s => s.id));

	for (const def of NATIVE_SOURCES) {
		if (enabledIds.has(def.id)) {
			registry.register(def.factory());
		}
	}
}

/**
 * Enable or disable a native source. Returns true if the source was found.
 */
export function setNativeSourceEnabled(sourceId: string, enabled: boolean): boolean {
	const def = NATIVE_SOURCES.find(s => s.id === sourceId);
	if (!def) return false;

	db.update(sourcesTable)
		.set({ enabled })
		.where(eq(sourcesTable.id, sourceId))
		.run();

	if (enabled) {
		registry.register(def.factory());
	} else {
		registry.unregister(sourceId);
	}

	return true;
}

/**
 * Get all available native sources with their enabled state.
 */
export function getNativeSources(): Array<{ id: string; name: string; lang: string; enabled: boolean }> {
	return NATIVE_SOURCES.map(def => {
		const row = db.select({ enabled: sourcesTable.enabled }).from(sourcesTable).where(eq(sourcesTable.id, def.id)).get();
		return { id: def.id, name: def.name, lang: def.lang, enabled: row?.enabled ?? false };
	});
}

// ── Extension adapter cache ──

const extensionAdapters = new Map<string, ExtensionSourceAdapter>();

function getExtensionAdapter(sourceId: string): ExtensionSourceAdapter | undefined {
	let adapter = extensionAdapters.get(sourceId);
	if (adapter) return adapter;

	// Try to find the extension in the DB
	const installed = getInstalledExtensions();
	const ext = installed.find((e) => e.id === sourceId && e.enabled);
	if (!ext) return undefined;

	adapter = new ExtensionSourceAdapter({
		id: ext.id,
		name: ext.name,
		lang: ext.lang,
		iconUrl: ext.iconUrl,
		baseUrl: ext.baseUrl,
	});
	extensionAdapters.set(sourceId, adapter);
	return adapter;
}

// ── Local path adapter cache ──

const localAdapters = new Map<string, LocalSourceAdapter>();

function getLocalAdapter(sourceId: string): LocalSourceAdapter | undefined {
	if (!sourceId.startsWith('local:')) return undefined;

	let adapter = localAdapters.get(sourceId);
	if (adapter) return adapter;

	const pathId = parseInt(sourceId.slice(6));
	const row = db.select().from(localLibraryPaths).where(eq(localLibraryPaths.id, pathId)).get();
	if (!row || !row.enabled) return undefined;

	adapter = new LocalSourceAdapter(row);
	localAdapters.set(sourceId, adapter);
	return adapter;
}

// ── SMB adapter cache ──

const smbAdapters = new Map<string, SmbSource>();

function getSmbAdapter(sourceId: string): SmbSource | undefined {
	if (!sourceId.startsWith('smb:')) return undefined;

	let adapter = smbAdapters.get(sourceId);
	if (adapter) return adapter;

	const connectionId = sourceId.slice(4);
	const config = getConnectionConfig(connectionId);
	if (!config || !config.enabled) return undefined;

	adapter = new SmbSource(config);
	smbAdapters.set(sourceId, adapter);
	return adapter;
}

// ── Source resolution ──

export function resolveSource(sourceId: string): ContentSource {
	const source = registry.get(sourceId);
	if (source) return source;

	const localAdapter = getLocalAdapter(sourceId);
	if (localAdapter) return localAdapter;

	const smbAdapter = getSmbAdapter(sourceId);
	if (smbAdapter) return smbAdapter;

	const adapter = getExtensionAdapter(sourceId);
	if (adapter) return adapter;

	throw new Error(`Unknown source: ${sourceId}`);
}

// ── Settings helpers ──

function filterByNsfwMode<T extends { items: WorkEntry[] }>(result: T): T {
	const mode: NsfwMode = getNsfwMode();
	if (mode === 'all') return result;
	if (mode === 'nsfw') return { ...result, items: result.items.filter((m) => m.nsfw) };
	return { ...result, items: result.items.filter((m) => !m.nsfw) };
}

// ── Library type helpers ──

function depthForType(type: LibraryType | undefined): number {
	return type === 'western' ? 2 : 1;
}

/** Resolve a library_id to its type. */
function resolveLibraryType(libraryId: string | null | undefined): LibraryType | undefined {
	if (!libraryId) return undefined;
	const lib = db.select({ type: userLibraries.type })
		.from(userLibraries)
		.where(eq(userLibraries.id, libraryId))
		.get();
	return lib?.type as LibraryType | undefined;
}

/**
 * Look up the effective content type for a work item.
 * Priority: source connection's explicit source_type → work's library type → default.
 */
function getSourceTypeForWork(sourceId: string, workId: string): LibraryType | undefined {
	// 1. Check the source connection's explicit source_type
	if (sourceId.startsWith('smb:')) {
		const connectionId = sourceId.slice(4);
		const conn = db.select({ sourceType: smbConnections.sourceType })
			.from(smbConnections)
			.where(eq(smbConnections.id, connectionId))
			.get();
		if (conn?.sourceType) return conn.sourceType as LibraryType;
	}
	if (sourceId.startsWith('local:')) {
		const pathId = parseInt(sourceId.slice(6));
		const row = db.select({ sourceType: localLibraryPaths.sourceType })
			.from(localLibraryPaths)
			.where(eq(localLibraryPaths.id, pathId))
			.get();
		if (row?.sourceType) return row.sourceType as LibraryType;
	}

	// 2. Fall back to the work's library type (if it's been added to a library)
	const entry = db.select({ libraryId: libraryTable.libraryId })
		.from(libraryTable)
		.where(and(eq(libraryTable.sourceId, sourceId), eq(libraryTable.workId, workId)))
		.get();
	return resolveLibraryType(entry?.libraryId);
}

// ── Reader settings cascade ──

/** Default reader settings per content type. */
const typeDefaults: Record<LibraryType, { direction: ReadingDirection; offset: boolean }> = {
	manga:    { direction: 'rtl', offset: true },
	western:  { direction: 'ltr', offset: false },
	webcomic: { direction: 'ltr', offset: false },
};

/** Convert a CoverArtMode string to a page offset number. */
export function coverArtModeToOffset(mode: CoverArtMode | string | null | undefined): number {
	switch (mode) {
		case 'none': return -1;
		case 'offset': return 1;
		case 'offset2': return 2;
		case 'auto':
		default: return 0;
	}
}

/**
 * Resolve cover art mode using the cascade:
 *   title override → collection override → library override → global app setting → default 'auto'.
 */
export function getResolvedCoverArtMode(sourceId: string, workId: string): CoverArtMode {
	// 1. Title override
	const titleEntry = db.select({
		id: libraryTable.id,
		coverArtMode: libraryTable.coverArtMode,
		libraryId: libraryTable.libraryId,
	})
		.from(libraryTable)
		.where(and(eq(libraryTable.sourceId, sourceId), eq(libraryTable.workId, workId)))
		.get();

	if (titleEntry?.coverArtMode) {
		return titleEntry.coverArtMode as CoverArtMode;
	}

	// 2. Collection override (first collection with an override wins)
	if (titleEntry) {
		const colRows = db.select({ coverArtMode: collections.coverArtMode })
			.from(collectionItems)
			.innerJoin(collections, eq(collectionItems.collectionId, collections.id))
			.where(eq(collectionItems.libraryItemId, titleEntry.id))
			.all();

		for (const row of colRows) {
			if (row.coverArtMode) return row.coverArtMode as CoverArtMode;
		}
	}

	// 3. Library override
	if (titleEntry?.libraryId) {
		const libOverride = db.select({ coverArtMode: userLibraries.coverArtMode })
			.from(userLibraries)
			.where(eq(userLibraries.id, titleEntry.libraryId))
			.get();

		if (libOverride?.coverArtMode) {
			return libOverride.coverArtMode as CoverArtMode;
		}
	}

	// 4. Global app setting
	const globalSetting = db.select().from(appSettings).where(eq(appSettings.key, 'cover.artMode')).get();
	if (globalSetting?.value) {
		return globalSetting.value as CoverArtMode;
	}

	// 5. Default
	return 'auto';
}

/**
 * Resolve reader settings using the cascade:
 *   title override → collection override → library override → type defaults → global app settings → hardcoded fallback.
 */
export function getResolvedReaderSettings(sourceId: string, workId: string): {
	direction: ReadingDirection;
	offset: boolean;
	mode: ReaderMode;
} {
	let direction: ReadingDirection | null = null;
	let offset: boolean | null = null;

	// 1. Title override (from library table)
	const titleEntry = db.select({
		id: libraryTable.id,
		readerDirection: libraryTable.readerDirection,
		readerOffset: libraryTable.readerOffset,
		libraryId: libraryTable.libraryId,
	})
		.from(libraryTable)
		.where(and(eq(libraryTable.sourceId, sourceId), eq(libraryTable.workId, workId)))
		.get();

	if (titleEntry?.readerDirection) {
		direction = titleEntry.readerDirection as ReadingDirection;
	}
	if (titleEntry?.readerOffset) {
		offset = titleEntry.readerOffset === 'true';
	}

	// 2. Collection override (first collection with an override wins)
	if (titleEntry && (direction === null || offset === null)) {
		const colRows = db.select({
			readerDirection: collections.readerDirection,
			readerOffset: collections.readerOffset,
		})
			.from(collectionItems)
			.innerJoin(collections, eq(collectionItems.collectionId, collections.id))
			.where(eq(collectionItems.libraryItemId, titleEntry.id))
			.all();

		for (const row of colRows) {
			if (direction === null && row.readerDirection) {
				direction = row.readerDirection as ReadingDirection;
			}
			if (offset === null && row.readerOffset) {
				offset = row.readerOffset === 'true';
			}
			if (direction !== null && offset !== null) break;
		}
	}

	// 3. Library override (from user_libraries table via work's library_id)
	if (titleEntry?.libraryId && (direction === null || offset === null)) {
		const libOverride = db.select({
			readerDirection: userLibraries.readerDirection,
			readerOffset: userLibraries.readerOffset,
		})
			.from(userLibraries)
			.where(eq(userLibraries.id, titleEntry.libraryId))
			.get();

		if (direction === null && libOverride?.readerDirection) {
			direction = libOverride.readerDirection as ReadingDirection;
		}
		if (offset === null && libOverride?.readerOffset) {
			offset = libOverride.readerOffset === 'true';
		}
	}

	// 5. Type defaults (derived from getSourceTypeForWork)
	if (direction === null || offset === null) {
		const srcType = getSourceTypeForWork(sourceId, workId);
		if (srcType && typeDefaults[srcType]) {
			if (direction === null) direction = typeDefaults[srcType].direction;
			if (offset === null) offset = typeDefaults[srcType].offset;
		}
	}

	// 6. Global app settings
	if (direction === null || offset === null) {
		const rows = db.select().from(appSettings).all();
		const settings = new Map(rows.map((r) => [r.key, r.value]));
		if (direction === null && settings.get('reader.direction')) {
			direction = settings.get('reader.direction') as ReadingDirection;
		}
		if (offset === null && settings.get('reader.offset') !== undefined) {
			const val = settings.get('reader.offset');
			if (val !== null) offset = val !== 'false';
		}
	}

	// 7. Hardcoded fallback
	if (direction === null) direction = 'rtl';
	if (offset === null) offset = true;

	// Mode: global setting only, no cascade
	const modeRow = db.select().from(appSettings).where(eq(appSettings.key, 'reader.mode')).get();
	const mode: ReaderMode = (modeRow?.value as ReaderMode) || 'spread';

	return { direction, offset, mode };
}

// ── Unified dispatch ──

export function getAllSources(): Source[] {
	const result: Source[] = registry.getAll();

	// Local library paths
	const paths = getConfiguredPaths();
	for (const p of paths) {
		result.push({
			id: `local:${p.id}`,
			name: p.label || p.path,
			lang: 'en',
			type: 'local',
		});
	}

	const installed = getInstalledExtensions();
	for (const ext of installed) {
		if (!ext.enabled) continue;
		result.push({
			id: ext.id,
			name: ext.name,
			lang: ext.lang,
			type: 'extension',
			iconUrl: ext.iconUrl ?? undefined,
			baseUrl: ext.baseUrl ?? undefined,
		});
	}

	// SMB connections
	const connections = getAllConnections();
	for (const conn of connections) {
		const sourceId = `smb:${conn.id}`;
		const state = getConnectionState(conn.id);
		// Background-check connections that have never been tested
		if (!state.connected) refreshConnectionState(conn.id);
		result.push({
			id: sourceId,
			name: conn.label,
			lang: 'en',
			type: 'smb',
			connected: state.connected,
		});
	}

	return result;
}

export async function browseSource(
	sourceId: string,
	page: number,
	mode: 'popular' | 'latest' = 'popular',
): Promise<PaginatedResult<WorkEntry>> {
	return filterByNsfwMode(await resolveSource(sourceId).browse(page, mode));
}

export async function searchSource(
	sourceId: string,
	query: string,
	page: number,
	filters?: SourceFilter[],
): Promise<PaginatedResult<WorkEntry>> {
	return filterByNsfwMode(await resolveSource(sourceId).search(query, page, filters));
}

export async function getDetail(
	sourceId: string,
	workId: string,
	fallbackTitle?: string,
): Promise<{ work: WorkEntry; chapters: Chapter[] }> {
	const source = resolveSource(sourceId);

	// Resolve cover art mode for all sources
	const coverArtMode = getResolvedCoverArtMode(sourceId, workId);
	const coverPageOffset = coverArtModeToOffset(coverArtMode);

	// For local/SMB sources, determine scan depth, browse mode, and pass cover offset to scanning
	if (sourceId.startsWith('local:') || sourceId.startsWith('smb:')) {
		const srcType = getSourceTypeForWork(sourceId, workId);
		const maxDepth = depthForType(srcType);
		return source.getDetail(workId, fallbackTitle, maxDepth, coverPageOffset);
	}

	const result = await source.getDetail(workId, fallbackTitle);

	// For remote sources, set lazy cover URLs on chapters that don't already have one
	if (coverPageOffset >= 0) {
		for (const ch of result.chapters) {
			if (!ch.coverUrl) {
				ch.coverUrl = `/api/sources/${sourceId}/chapter-cover?chapterId=${encodeURIComponent(ch.id)}&offset=${coverPageOffset}&workId=${encodeURIComponent(workId)}`;
			}
		}
	}

	return result;
}

export async function getChapterPages(
	sourceId: string,
	chapterId: string,
	signal?: AbortSignal,
): Promise<Page[]> {
	return resolveSource(sourceId).getChapterPages(chapterId, signal);
}

export function getSourceFilters(sourceId: string): SourceFilter[] {
	return resolveSource(sourceId).getFilters();
}

// ── Cross-source aggregation ──

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('Timeout')), ms);
		promise.then(
			(val) => { clearTimeout(timer); resolve(val); },
			(err) => { clearTimeout(timer); reject(err); },
		);
	});
}

export async function searchAllSources(
	query: string,
	page: number,
): Promise<Array<{ source: Source; items: WorkEntry[]; hasNextPage: boolean }>> {
	const sources = getAllSources().filter((s) => s.type !== 'local' && s.type !== 'smb' || (s.type === 'smb' && s.connected));
	const TIMEOUT = 8000;

	const results = await Promise.allSettled(
		sources.map(async (source) => {
			const result = await withTimeout(searchSource(source.id, query, page), TIMEOUT);
			return { source, items: result.items, hasNextPage: result.hasNextPage };
		}),
	);

	return results
		.filter((r): r is PromiseFulfilledResult<{ source: Source; items: WorkEntry[]; hasNextPage: boolean }> =>
			r.status === 'fulfilled')
		.map((r) => r.value)
		.sort((a, b) => b.items.length - a.items.length);
}

export async function findAlternatives(
	excludeSourceId: string,
	title: string,
): Promise<Array<{ source: Source; work: WorkEntry; chapterCount: number }>> {
	const sources = getAllSources().filter((s) => s.type !== 'local' && s.id !== excludeSourceId && !(s.type === 'smb' && !s.connected));
	const TIMEOUT = 8000;

	const results = await Promise.allSettled(
		sources.map(async (source) => {
			const searchResult = await withTimeout(searchSource(source.id, title, 1), TIMEOUT);
			if (searchResult.items.length === 0) return null;

			const bestMatch = searchResult.items[0];
			const detail = await withTimeout(getDetail(source.id, bestMatch.id), TIMEOUT);
			const chapterCount = detail.chapters.length;
			if (chapterCount === 0) return null;

			return { source, work: bestMatch, chapterCount };
		}),
	);

	return results
		.filter((r): r is PromiseFulfilledResult<{ source: Source; work: WorkEntry; chapterCount: number } | null> =>
			r.status === 'fulfilled')
		.map((r) => r.value)
		.filter((v): v is { source: Source; work: WorkEntry; chapterCount: number } => v !== null)
		.sort((a, b) => b.chapterCount - a.chapterCount);
}

/** Flush all in-memory caches (extension runtimes, adapter cache, native source caches, SMB). */
export function clearAllCaches(): void {
	clearRuntimeCache();
	extensionAdapters.clear();
	localAdapters.clear();
	smbAdapters.clear();
	if (registry.has('mangadex')) clearAtHomeCache();
	closeSmbClients();
}

export { clearRuntimeCache };
