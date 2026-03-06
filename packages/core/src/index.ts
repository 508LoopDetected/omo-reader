/**
 * @omo/core — shared backend for OMO Reader.
 * Re-exports all public API functions and types.
 */

// ── Types ──
export type {
	Source,
	WorkEntry,
	Chapter,
	Page,
	PaginatedResult,
	ReadingProgress,
	UserLibrary,
	Collection,
	ReaderMode,
	ReadingDirection,
	CoverArtMode,
	LibraryType,
} from './types/work.js';

export type {
	EnrichedLibraryItem,
	HomeData,
	LibraryQueryOptions,
	CollectionQueryOptions,
	WorkCompositeData,
	ContinueReadingItem,
} from './core/types.js';

export type { ContentSource, SourceFilter } from './sources/source-interface.js';

export type {
	AppManifest,
	ViewDef,
	SettingDef,
	ManagementSection,
	ManagementActionDef,
	FieldDef,
	NavItemDef,
	ControlDef,
} from './core/manifest.js';

export type { AddToLibraryInput } from './core/library-service.js';
export type { NsfwMode } from './sources/settings.js';
export type { OmoConfig } from './init.js';

// ── Initialization ──
export { initialize } from './init.js';

// ── Database ──
export { db, initializeDb, resetDatabase } from './db/client.js';

// ── Library service ──
export {
	queryLibrary,
	getRawLibrary,
	addToLibrary,
	updateLibraryEntry,
	removeFromLibrary,
	bulkAddFromSource,
	moveLibraryEntry,
	updateNsfw,
	updateTitle,
	queryCollectionItems,
	getHomeData,
	getWorkComposite,
} from './core/library-service.js';

// ── Progress service ──
export {
	getChapterProgress,
	getWorkProgress,
	getRecentProgress,
	saveProgress,
	dismissWork,
	resetWorkProgress,
	markChapter,
} from './core/progress-service.js';

// ── Collections service ──
export {
	getAllCollections,
	createCollection,
	updateCollection,
	deleteCollection,
	getCollectionItemsRaw,
	getCollectionItemsByLibrary,
	getCollectionIdsForWork,
	addToCollection,
	removeFromCollection,
} from './core/collections-service.js';

// ── User libraries service ──
export {
	getAllUserLibraries,
	createUserLibrary,
	updateUserLibrary,
	deleteUserLibrary,
} from './core/user-libraries-service.js';

// ── Settings service ──
export {
	getAppSettings,
	saveAppSettings,
	getLocalPaths,
	addLocalPath,
	updateLocalPath,
	deleteLocalPath,
	getSmbConnections,
	addSmbConnection,
	updateSmbConnection,
	deleteSmbConnection,
	getExtensionRepos,
	addExtensionRepo,
	deleteExtensionRepo,
	resetAll,
} from './core/settings-service.js';

// ── Reader settings service ──
export {
	getReaderSettings,
	saveReaderSettings,
} from './core/reader-settings-service.js';

// ── Reading logic ──
export {
	isChapterRead,
	computeUnreadCounts,
	buildContinueReading,
	READ_THRESHOLD,
} from './core/reading.js';

// ── Source manager ──
export {
	getAllSources,
	browseSource,
	searchSource,
	getDetail,
	getChapterPages,
	searchAllSources,
	findAlternatives,
	getSourceFilters,
	getResolvedReaderSettings,
	getResolvedCoverArtMode,
	coverArtModeToOffset,
	clearAllCaches,
	clearRuntimeCache,
} from './sources/manager.js';

// ── Manifest ──
export { getAppManifest } from './core/manifest.js';

// ── Extensions ──
export {
	fetchExtensionIndex,
	installExtension,
	uninstallExtension,
	getInstalledExtensions,
} from './extensions/loader.js';

// ── Image proxy ──
export { proxyImage } from './proxy/image-proxy.js';

// ── Thumbnails ──
export { getThumbnail } from './thumbnails/thumbnail-service.js';
export {
	getStats as getThumbnailStats,
	clearAll as clearAllThumbnails,
	clearForTitle as clearThumbnailsForTitle,
	clearForSource as clearThumbnailsForSource,
} from './thumbnails/thumbnail-cache.js';

// ── Local source (image serving) ──
export { getImage as getLocalImage } from './sources/local/local-source.js';

// ── SMB source (image serving) ──
export { getSmbImage } from './sources/smb/smb-source.js';

// ── SMB client (connection testing) ──
export {
	testConnection as testSmbConnection,
	testConnectionRaw as testSmbConnectionRaw,
	getConnectionConfig as getSmbConnectionConfig,
} from './sources/smb/smb-client.js';

// ── NSFW settings ──
export { getNsfwMode } from './sources/settings.js';

// ── Standalone HTTP server ──
export { createServer } from './server.js';
export type { ServerOptions, OmoServer } from './server.js';
