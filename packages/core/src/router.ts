/**
 * Standalone HTTP router — all API routes, reader SPA, and GUI SPA serving.
 */

import { join, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from './types/work.js';
import type { SourceFilter } from './sources/source-interface.js';
import { db } from './db/client.js';
import { library, onlineMetadata } from './db/schema.js';
import { eq, and } from 'drizzle-orm';

// ── Reader SPA static files ──

const __dirname = dirname(fileURLToPath(import.meta.url));

let _readerDir: string | null | undefined; // undefined = not resolved yet
let _guiDir: string | null | undefined; // undefined = not resolved yet

function resolveReaderDir(): string | null {
	if (_readerDir !== undefined) return _readerDir;

	// 1. Explicit override via env var
	const envDir = process.env.OMO_READER_DIR;
	if (envDir && existsSync(join(envDir, 'index.html'))) {
		_readerDir = envDir;
		return _readerDir;
	}

	// 2. XDG data dir (where installer places it)
	const xdgDataHome = process.env.XDG_DATA_HOME || join(process.env.HOME || '~', '.local', 'share');
	const xdgDir = join(xdgDataHome, 'omo-reader', 'reader');
	if (existsSync(join(xdgDir, 'index.html'))) {
		_readerDir = xdgDir;
		return _readerDir;
	}

	// 3. Adjacent to binary (compiled binaries: reader/ next to the executable)
	const binDir = dirname(process.execPath);
	const binAdjacentDir = join(binDir, 'reader');
	if (existsSync(join(binAdjacentDir, 'index.html'))) {
		_readerDir = binAdjacentDir;
		return _readerDir;
	}

	// 4. Development / relative path (core/static/reader)
	const devDir = join(__dirname, '..', 'static', 'reader');
	if (existsSync(join(devDir, 'index.html'))) {
		_readerDir = devDir;
		return _readerDir;
	}

	// No reader SPA found — graceful degradation
	_readerDir = null;
	return _readerDir;
}

function resolveGuiDir(): string | null {
	if (_guiDir !== undefined) return _guiDir;

	// 1. Explicit override via env var
	const envDir = process.env.OMO_GUI_DIR;
	if (envDir && existsSync(join(envDir, 'index.html'))) {
		_guiDir = envDir;
		return _guiDir;
	}

	// 2. XDG data dir (where installer places it)
	const xdgDataHome = process.env.XDG_DATA_HOME || join(process.env.HOME || '~', '.local', 'share');
	const xdgDir = join(xdgDataHome, 'omo-reader', 'gui');
	if (existsSync(join(xdgDir, 'index.html'))) {
		_guiDir = xdgDir;
		return _guiDir;
	}

	// 3. Adjacent to binary (compiled binaries: gui/ next to the executable)
	const binDir = dirname(process.execPath);
	const binAdjacentDir = join(binDir, 'gui');
	if (existsSync(join(binAdjacentDir, 'index.html'))) {
		_guiDir = binAdjacentDir;
		return _guiDir;
	}

	// 4. Development / relative path (core/static/gui)
	const devDir = join(__dirname, '..', 'static', 'gui');
	if (existsSync(join(devDir, 'index.html'))) {
		_guiDir = devDir;
		return _guiDir;
	}

	// No GUI SPA found
	_guiDir = null;
	return _guiDir;
}

const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'application/javascript',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.json': 'application/json',
};

// ── Core imports ──

import {
	// Library
	queryLibrary, getRawLibrary, addToLibrary, updateLibraryEntry,
	removeFromLibrary, bulkAddFromSource, moveLibraryEntry,
	updateNsfw, updateTitle,
	// Progress
	getChapterProgress, getWorkProgress, getRecentProgress,
	saveProgress, dismissWork, resetWorkProgress, markChapter,
	// Collections
	getAllCollections, createCollection, updateCollection, deleteCollection,
	getCollectionItemsRaw, getCollectionItemsByLibrary, getCollectionIdsForWork,
	addToCollection, removeFromCollection, queryCollectionItems,
	// User libraries
	getAllUserLibraries, createUserLibrary, updateUserLibrary, deleteUserLibrary,
	// Settings
	getAppSettings, saveAppSettings,
	getLocalPaths, addLocalPath, updateLocalPath, deleteLocalPath,
	getSmbConnections, addSmbConnection, updateSmbConnection, deleteSmbConnection,
	getExtensionRepos, addExtensionRepo, deleteExtensionRepo,
	resetAll,
	// Reader settings
	getReaderSettings, saveReaderSettings,
	// Stats (ratings + activity)
	getRating, setRating, deleteRating,
	// Sources
	getAllSources, browseSource, searchSource, getDetail, getChapterPages,
	searchAllSources, findAlternatives, getSourceFilters, getWorkComposite,
	getNativeSources, setNativeSourceEnabled,
	// Manifest
	getAppManifest,
	// Extensions
	fetchExtensionIndex, installExtension, uninstallExtension, clearRuntimeCache,
	// Images
	proxyImage, getThumbnail, getLocalImage, getSmbImage,
	// Thumbnails cache
	getThumbnailStats, clearAllThumbnails, clearThumbnailsForTitle, clearThumbnailsForSource,
	// SMB test & browse
	testSmbConnection, testSmbConnectionRaw, getSmbConnectionConfig,
	smbListSharesRaw, smbReaddirRaw,
	// Home
	getHomeData,
	// Metadata
	searchMetadata, getMetadataStatus, fetchMetadata,
	linkMetadata, unlinkMetadata, fetchLibraryMetadata,
} from './index.js';

// ── Helpers ──

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function errorResponse(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function binaryResponse(data: ArrayBuffer | Uint8Array | Buffer, contentType: string, maxAge = 86400): Response {
	return new Response(data as unknown as BodyInit, {
		headers: {
			'Content-Type': contentType,
			'Cache-Control': `public, max-age=${maxAge}`,
		},
	});
}

function q(url: URL, key: string): string | null {
	return url.searchParams.get(key);
}

// ── Chapter-cover page cache ──

const pageCache = new Map<string, { pages: Page[]; expiresAt: number }>();
const PAGE_CACHE_TTL = 5 * 60 * 1000;
const PAGE_CACHE_MAX = 500;

function getCachedPages(key: string): Page[] | undefined {
	const entry = pageCache.get(key);
	if (!entry) return undefined;
	if (Date.now() > entry.expiresAt) { pageCache.delete(key); return undefined; }
	return entry.pages;
}

function setCachedPages(key: string, pages: Page[]): void {
	if (pageCache.size >= PAGE_CACHE_MAX) {
		const first = pageCache.keys().next().value;
		if (first) pageCache.delete(first);
	}
	pageCache.set(key, { pages, expiresAt: Date.now() + PAGE_CACHE_TTL });
}

// ── Route matching ──

const SOURCE_RE = /^\/api\/sources\/([^/]+)\/(.+)$/;

/**
 * Route a request to a handler. Returns a Response or null (404).
 */
export async function route(req: Request): Promise<Response | null> {
	const url = new URL(req.url);
	const method = req.method;
	const path = url.pathname;

	// ── Reader SPA ──

	if (path === '/reader' || path.startsWith('/reader/')) {
		if (method === 'GET') {
			const result = serveReaderFile(path);
			if (result) return result;
		}
	}

	// ── Static routes ──

	switch (path) {
		case '/api/home':
			if (method === 'GET') return handleHomeGet(url);
			break;

		case '/api/manifest':
			if (method === 'GET') return handleManifestGet();
			break;

		case '/api/search':
			if (method === 'GET') return handleSearchGet(url);
			break;

		case '/api/sources':
			if (method === 'GET') return json(getAllSources());
			break;

		case '/api/library':
			if (method === 'GET') return handleLibraryGet(url);
			if (method === 'POST') return handleLibraryPost(req);
			if (method === 'PUT') return handleLibraryPut(req);
			if (method === 'DELETE') return handleLibraryDelete(url);
			break;

		case '/api/library/bulk':
			if (method === 'POST') return handleLibraryBulk(req);
			break;

		case '/api/library/move':
			if (method === 'POST') return handleLibraryMove(req);
			break;

		case '/api/library/update-nsfw':
			if (method === 'POST') return handleLibraryUpdateNsfw(req);
			break;

		case '/api/library/update-title':
			if (method === 'POST') return handleLibraryUpdateTitle(req);
			break;

		case '/api/progress':
			if (method === 'GET') return handleProgressGet(url);
			if (method === 'POST') return handleProgressPost(req);
			if (method === 'PATCH') return handleProgressPatch(req);
			if (method === 'DELETE') return handleProgressDelete(url);
			break;

		case '/api/progress/mark':
			if (method === 'POST') return handleProgressMark(req);
			break;

		case '/api/collections':
			if (method === 'GET') return json(getAllCollections());
			if (method === 'POST') return handleCollectionsPost(req);
			if (method === 'PUT') return handleCollectionsPut(req);
			if (method === 'DELETE') return handleCollectionsDelete(url);
			break;

		case '/api/collections/items':
			if (method === 'GET') return handleCollectionItemsGet(url);
			if (method === 'POST') return handleCollectionItemsPost(req);
			if (method === 'DELETE') return handleCollectionItemsDelete(url);
			break;

		case '/api/user-libraries':
			if (method === 'GET') return json(getAllUserLibraries());
			if (method === 'POST') return handleUserLibrariesPost(req);
			if (method === 'PUT') return handleUserLibrariesPut(req);
			if (method === 'DELETE') return handleUserLibrariesDelete(url);
			break;

		case '/api/settings/app':
			if (method === 'GET') return json(getAppSettings());
			if (method === 'POST') { const body = await req.json(); saveAppSettings(body); return json({ success: true }); }
			break;

		case '/api/settings/paths':
			if (method === 'GET') return json(getLocalPaths());
			if (method === 'POST') return handlePathsPost(req);
			if (method === 'PUT') return handlePathsPut(req);
			if (method === 'DELETE') return handlePathsDelete(url);
			break;

		case '/api/settings/repos':
			if (method === 'GET') return json(getExtensionRepos());
			if (method === 'POST') return handleReposPost(req);
			if (method === 'DELETE') return handleReposDelete(url);
			break;

		case '/api/settings/reset':
			if (method === 'POST') { await resetAll(); return json({ success: true }); }
			break;

		case '/api/settings/smb':
			if (method === 'GET') return json(getSmbConnections());
			if (method === 'POST') return handleSmbPost(req);
			if (method === 'PUT') return handleSmbPut(req);
			if (method === 'DELETE') return handleSmbDelete(url);
			break;

		case '/api/settings/smb/test':
			if (method === 'POST') return handleSmbTest(req);
			break;

		case '/api/settings/smb/browse':
			if (method === 'POST') return handleSmbBrowse(req);
			break;

		case '/api/rating':
			if (method === 'GET') return handleRatingGet(url);
			if (method === 'POST') return handleRatingPost(req);
			if (method === 'DELETE') return handleRatingDelete(url);
			break;

		case '/api/reader-settings':
			if (method === 'GET') return handleReaderSettingsGet(url);
			if (method === 'POST') return handleReaderSettingsPost(req);
			break;

		case '/api/metadata/search':
			if (method === 'GET') return handleMetadataSearch(url);
			break;

		case '/api/metadata/status':
			if (method === 'GET') return handleMetadataStatusGet(url);
			break;

		case '/api/metadata/fetch':
			if (method === 'POST') return handleMetadataFetch(req);
			break;

		case '/api/metadata/fetch-library':
			if (method === 'POST') return handleMetadataFetchLibrary(req);
			break;

		case '/api/metadata/link':
			if (method === 'POST') return handleMetadataLink(req);
			if (method === 'DELETE') return handleMetadataUnlink(url);
			break;

		case '/api/metadata/overrides':
			if (method === 'POST') return handleMetadataOverridesSave(req);
			break;

		case '/api/native-sources':
			if (method === 'GET') return json(getNativeSources());
			break;

		case '/api/native-sources/toggle':
			if (method === 'POST') return handleNativeSourceToggle(req);
			break;

		case '/api/extensions':
			if (method === 'GET') return json(await fetchExtensionIndex());
			break;

		case '/api/extensions/install':
			if (method === 'POST') return handleExtensionInstall(req);
			break;

		case '/api/extensions/uninstall':
			if (method === 'POST') return handleExtensionUninstall(req);
			break;

		case '/api/cache/thumbnails':
			if (method === 'GET') return json(await getThumbnailStats());
			if (method === 'DELETE') return handleThumbnailCacheDelete(url);
			break;

		case '/api/proxy/image':
			if (method === 'GET') return handleProxyImage(url);
			break;

		case '/api/thumbnail':
			if (method === 'GET') return handleThumbnail(url, req);
			break;

		case '/api/local/image':
			if (method === 'GET') return handleLocalImage(url);
			break;

		case '/api/smb/image':
			if (method === 'GET') return handleSmbImage(url);
			break;
	}

	// ── Dynamic routes: /api/sources/:sourceId/* ──

	const sourceMatch = path.match(SOURCE_RE);
	if (sourceMatch) {
		const sourceId = decodeURIComponent(sourceMatch[1]);
		const sub = sourceMatch[2];

		switch (sub) {
			case 'browse':
				if (method === 'GET') return handleSourceBrowse(url, sourceId);
				break;
			case 'search':
				if (method === 'GET') return handleSourceSearchGet(url, sourceId);
				if (method === 'POST') return handleSourceSearchPost(req, sourceId);
				break;
			case 'pages':
				if (method === 'GET') return handleSourcePages(url, req, sourceId);
				break;
			case 'work':
				if (method === 'GET') return handleSourceWork(url, sourceId);
				break;
			case 'alternatives':
				if (method === 'GET') return handleSourceAlternatives(url, sourceId);
				break;
			case 'filters':
				if (method === 'GET') return handleSourceFilters(sourceId);
				break;
			case 'chapter-cover':
				if (method === 'GET') return handleChapterCover(url, req, sourceId);
				break;
		}
	}

	// ── GUI SPA fallback (last resort, after API + reader) ──

	if (method === 'GET') {
		const guiResponse = serveGuiFile(path);
		if (guiResponse) return guiResponse;
	}

	// No match — let caller handle 404
	return null;
}

// ── Handler implementations ──

// -- Reader SPA --

function serveReaderFile(path: string): Response | null {
	const readerDir = resolveReaderDir();
	if (!readerDir) return null;

	// Serve index.html for /reader or /reader/
	let filePath: string;
	if (path === '/reader' || path === '/reader/') {
		filePath = join(readerDir, 'index.html');
	} else {
		// Strip /reader/ prefix and serve the file
		const relative = path.slice('/reader/'.length);
		filePath = join(readerDir, relative);
	}

	if (!existsSync(filePath)) return null;

	const ext = '.' + filePath.split('.').pop();
	const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

	return new Response(readFileSync(filePath), {
		headers: {
			'Content-Type': contentType,
			'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
		},
	});
}

// -- GUI SPA --

function serveGuiFile(path: string): Response | null {
	const guiDir = resolveGuiDir();
	if (!guiDir) return null;

	// Try to serve the exact file first
	if (path !== '/') {
		const relative = path.slice(1); // strip leading /
		const filePath = join(guiDir, relative);
		if (existsSync(filePath)) {
			const ext = '.' + filePath.split('.').pop();
			const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
			return new Response(readFileSync(filePath), {
				headers: {
					'Content-Type': contentType,
					'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
				},
			});
		}
	}

	// SPA fallback: serve index.html for any non-API, non-reader path
	const indexPath = join(guiDir, 'index.html');
	if (!existsSync(indexPath)) return null;
	return new Response(readFileSync(indexPath), {
		headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' },
	});
}

// -- Home --

async function handleHomeGet(url: URL): Promise<Response> {
	return json(getHomeData(q(url, 'nsfwMode') ?? undefined));
}

// -- Manifest --

async function handleManifestGet(): Promise<Response> {
	return json(await getAppManifest());
}

// -- Search (all sources) --

async function handleSearchGet(url: URL): Promise<Response> {
	const query = q(url, 'q') ?? '';
	const page = parseInt(q(url, 'page') ?? '1');
	if (!query.trim()) return json({ results: [] });
	try {
		return json({ results: await searchAllSources(query, page) });
	} catch (err) {
		console.error('Multi-source search failed:', err);
		return errorResponse(500, `Search failed: ${err}`);
	}
}

// -- Library --

function handleLibraryGet(url: URL): Response {
	if (q(url, 'enriched') === 'true') {
		return json(queryLibrary({
			libraryId: q(url, 'libraryId') ?? undefined,
			sort: (q(url, 'sort') as 'title' | 'recent' | 'added') ?? undefined,
			search: q(url, 'search') ?? undefined,
			nsfwMode: q(url, 'nsfwMode') ?? undefined,
		}));
	}
	return json(getRawLibrary(q(url, 'libraryId') ?? undefined));
}

async function handleLibraryPost(req: Request): Promise<Response> {
	const body = await req.json();
	if (!body.sourceId || !body.workId || !body.title || !body.url) {
		return errorResponse(400, 'Missing required fields');
	}
	const result = addToLibrary(body);
	return json({ success: true, id: result.id, alreadyExists: result.alreadyExists });
}

async function handleLibraryPut(req: Request): Promise<Response> {
	const { sourceId, workId, libraryId } = await req.json();
	if (!sourceId || !workId) return errorResponse(400, 'Missing sourceId or workId');
	try {
		updateLibraryEntry(sourceId, workId, { libraryId });
	} catch {
		return errorResponse(404, 'Title not in library');
	}
	return json({ success: true });
}

function handleLibraryDelete(url: URL): Response {
	const sourceId = q(url, 'sourceId');
	const workId = q(url, 'workId');
	if (!sourceId || !workId) return errorResponse(400, 'Missing required parameters');
	removeFromLibrary(sourceId, workId);
	return json({ success: true });
}

async function handleLibraryBulk(req: Request): Promise<Response> {
	const { sourceId, libraryId } = await req.json();
	if (!sourceId) return errorResponse(400, 'Missing sourceId');
	const result = await bulkAddFromSource(sourceId, libraryId);
	return json({ success: true, ...result });
}

async function handleLibraryMove(req: Request): Promise<Response> {
	const { sourceId, workId, libraryId } = await req.json();
	if (!sourceId || !workId) return errorResponse(400, 'Missing sourceId or workId');
	moveLibraryEntry(sourceId, workId, libraryId ?? null);
	return json({ success: true });
}

async function handleLibraryUpdateNsfw(req: Request): Promise<Response> {
	const { sourceId, workId, nsfw } = await req.json();
	if (!sourceId || !workId || typeof nsfw !== 'boolean') return errorResponse(400, 'Missing required fields');
	updateNsfw(sourceId, workId, nsfw);
	return json({ success: true });
}

async function handleLibraryUpdateTitle(req: Request): Promise<Response> {
	const { sourceId, workId, title } = await req.json();
	if (!sourceId || !workId || !title) return errorResponse(400, 'Missing required fields');
	updateTitle(sourceId, workId, title);
	return json({ success: true });
}

// -- Progress --

function handleProgressGet(url: URL): Response {
	const sourceId = q(url, 'sourceId');
	const workId = q(url, 'workId');
	const chapterId = q(url, 'chapterId');
	if (sourceId && workId && chapterId) return json(getChapterProgress(sourceId, workId, chapterId));
	if (sourceId && workId) return json(getWorkProgress(sourceId, workId));
	return json(getRecentProgress());
}

async function handleProgressPost(req: Request): Promise<Response> {
	const { sourceId, workId, chapterId, page, totalPages } = await req.json();
	if (!sourceId || !workId || !chapterId || page === undefined) {
		return errorResponse(400, 'Missing required fields');
	}
	return json(saveProgress(sourceId, workId, chapterId, page, totalPages));
}

async function handleProgressPatch(req: Request): Promise<Response> {
	const { sourceId, workId } = await req.json();
	if (!sourceId || !workId) return errorResponse(400, 'Missing sourceId or workId');
	dismissWork(sourceId, workId);
	return json({ success: true });
}

function handleProgressDelete(url: URL): Response {
	const sourceId = q(url, 'sourceId');
	const workId = q(url, 'workId');
	if (!sourceId || !workId) return errorResponse(400, 'Missing sourceId or workId');
	resetWorkProgress(sourceId, workId);
	return json({ success: true });
}

async function handleProgressMark(req: Request): Promise<Response> {
	const { sourceId, workId, chapterId, read } = await req.json();
	if (!sourceId || !workId || !chapterId || typeof read !== 'boolean') {
		return errorResponse(400, 'Missing required fields: sourceId, workId, chapterId, read');
	}
	markChapter(sourceId, workId, chapterId, read);
	return json({ success: true });
}

// -- Collections --

async function handleCollectionsPost(req: Request): Promise<Response> {
	const { name } = await req.json();
	if (!name) return errorResponse(400, 'Missing required field: name');
	return json({ success: true, id: createCollection(name) });
}

async function handleCollectionsPut(req: Request): Promise<Response> {
	const body = await req.json();
	if (!body.id) return errorResponse(400, 'Missing id');
	updateCollection(body.id, body);
	return json({ success: true });
}

function handleCollectionsDelete(url: URL): Response {
	const id = q(url, 'id');
	if (!id) return errorResponse(400, 'Missing id');
	deleteCollection(id);
	return json({ success: true });
}

function handleCollectionItemsGet(url: URL): Response {
	const collectionId = q(url, 'collectionId');
	const sourceId = q(url, 'sourceId');
	const workId = q(url, 'workId');
	const libraryId = q(url, 'libraryId');
	const enriched = q(url, 'enriched') === 'true';

	if (collectionId && enriched) {
		return json(queryCollectionItems(collectionId, {
			sort: (q(url, 'sort') as 'title' | 'recent' | 'added') ?? undefined,
			search: q(url, 'search') ?? undefined,
			nsfwMode: q(url, 'nsfwMode') ?? undefined,
		}));
	}
	if (collectionId) return json(getCollectionItemsRaw(collectionId));
	if (libraryId) return json(getCollectionItemsByLibrary(libraryId));
	if (sourceId && workId) return json(getCollectionIdsForWork(sourceId, workId));
	return errorResponse(400, 'Missing collectionId or sourceId+workId');
}

async function handleCollectionItemsPost(req: Request): Promise<Response> {
	const { collectionId, sourceId, workId } = await req.json();
	if (!collectionId || !sourceId || !workId) {
		return errorResponse(400, 'Missing collectionId, sourceId, or workId');
	}
	try {
		addToCollection(collectionId, sourceId, workId);
	} catch {
		return errorResponse(404, 'Title not in library');
	}
	return json({ success: true });
}

function handleCollectionItemsDelete(url: URL): Response {
	const collectionId = q(url, 'collectionId');
	const sourceId = q(url, 'sourceId');
	const workId = q(url, 'workId');
	if (!collectionId || !sourceId || !workId) {
		return errorResponse(400, 'Missing collectionId, sourceId, or workId');
	}
	removeFromCollection(collectionId, sourceId, workId);
	return json({ success: true });
}

// -- User libraries --

async function handleUserLibrariesPost(req: Request): Promise<Response> {
	const { name, type } = await req.json();
	if (!name || !type) return errorResponse(400, 'Missing required fields: name, type');
	try {
		return json({ success: true, id: createUserLibrary(name, type) });
	} catch (e) {
		return errorResponse(400, (e as Error).message);
	}
}

async function handleUserLibrariesPut(req: Request): Promise<Response> {
	const body = await req.json();
	if (!body.id) return errorResponse(400, 'Missing id');
	// Coerce nsfw from string to boolean if needed
	if (body.nsfw !== undefined) {
		body.nsfw = body.nsfw === true || body.nsfw === 'true';
	}
	try {
		updateUserLibrary(body.id, body);
	} catch (e) {
		return errorResponse(400, (e as Error).message);
	}
	return json({ success: true });
}

function handleUserLibrariesDelete(url: URL): Response {
	const id = q(url, 'id');
	if (!id) return errorResponse(400, 'Missing id');
	deleteUserLibrary(id);
	return json({ success: true });
}

// -- Settings: paths --

async function handlePathsPost(req: Request): Promise<Response> {
	const body = await req.json();
	if (!body.path) return errorResponse(400, 'Missing path');
	return json({ success: true, id: addLocalPath(body) });
}

async function handlePathsPut(req: Request): Promise<Response> {
	const body = await req.json();
	if (!body.id) return errorResponse(400, 'Missing id');
	updateLocalPath(parseInt(body.id), body);
	return json({ success: true });
}

function handlePathsDelete(url: URL): Response {
	const id = q(url, 'id');
	if (!id) return errorResponse(400, 'Missing id');
	return json({ success: true, removedTitles: deleteLocalPath(parseInt(id)) });
}

// -- Settings: repos --

async function handleReposPost(req: Request): Promise<Response> {
	const { name, url: repoUrl } = await req.json();
	if (!name || !repoUrl) return errorResponse(400, 'Missing name or url');
	return json({ success: true, id: addExtensionRepo(name, repoUrl) });
}

function handleReposDelete(url: URL): Response {
	const id = q(url, 'id');
	if (!id) return errorResponse(400, 'Missing id');
	deleteExtensionRepo(parseInt(id));
	return json({ success: true });
}

// -- Settings: SMB --

async function handleSmbPost(req: Request): Promise<Response> {
	const body = await req.json();
	const { label, host, share, username, password } = body;
	if (!label || !host || !share || !username || !password) {
		return errorResponse(400, 'Missing required fields: label, host, share, username, password');
	}
	return json({ success: true, id: addSmbConnection(body) });
}

async function handleSmbPut(req: Request): Promise<Response> {
	const body = await req.json();
	if (!body.id) return errorResponse(400, 'Missing id');
	updateSmbConnection(body.id, body);
	return json({ success: true });
}

function handleSmbDelete(url: URL): Response {
	const id = q(url, 'id');
	if (!id) return errorResponse(400, 'Missing id');
	return json({ success: true, removedTitles: deleteSmbConnection(id) });
}

async function handleSmbTest(req: Request): Promise<Response> {
	const body = await req.json();

	if (body.id) {
		const config = getSmbConnectionConfig(body.id);
		if (!config) return errorResponse(404, 'Connection not found');
		const connected = await testSmbConnection(body.id);
		return json({ connected, error: connected ? undefined : 'Could not connect to SMB share' });
	}

	const { host, share, path, domain, username, password } = body;
	if (!host || !share || !username || !password) {
		return errorResponse(400, 'Missing required fields: host, share, username, password');
	}
	return json(await testSmbConnectionRaw({ host, share, domain, username, password }, path));
}

async function handleSmbBrowse(req: Request): Promise<Response> {
	const body = await req.json();
	const { host, domain, username, password, share, path } = body;
	if (!host || !username || !password) {
		return errorResponse(400, 'Missing required fields: host, username, password');
	}

	try {
		// If no share specified, list available shares
		if (!share) {
			const shares = await smbListSharesRaw({ host, domain, username, password });
			return json({ type: 'shares', items: shares.map((s) => ({ name: s.name, comment: s.comment })) });
		}

		// List directories within the share (optionally at a subpath)
		const entries = await smbReaddirRaw({ host, share, domain, username, password }, path ?? '');
		const dirs = entries
			.filter((e) => e.isDirectory && !e.name.startsWith('.'))
			.map((e) => ({ name: e.name }));
		return json({ type: 'dirs', items: dirs });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return json({ type: 'error', error: msg }, 500);
	}
}

// -- Ratings --

function handleRatingGet(url: URL): Response {
	const sourceId = q(url, 'sourceId');
	const workId = q(url, 'workId');
	if (!sourceId || !workId) return errorResponse(400, 'Missing sourceId or workId');
	return json({ rating: getRating(sourceId, workId) });
}

async function handleRatingPost(req: Request): Promise<Response> {
	const { sourceId, workId, rating } = await req.json();
	if (!sourceId || !workId || typeof rating !== 'number') {
		return errorResponse(400, 'Missing sourceId, workId, or rating');
	}
	setRating(sourceId, workId, rating);
	return json({ success: true });
}

function handleRatingDelete(url: URL): Response {
	const sourceId = q(url, 'sourceId');
	const workId = q(url, 'workId');
	if (!sourceId || !workId) return errorResponse(400, 'Missing sourceId or workId');
	deleteRating(sourceId, workId);
	return json({ success: true });
}

// -- Reader settings --

function handleReaderSettingsGet(url: URL): Response {
	const sourceId = q(url, 'sourceId');
	const workId = q(url, 'workId');
	if (!sourceId || !workId) return errorResponse(400, 'Missing sourceId or workId');
	return json(getReaderSettings(sourceId, workId));
}

async function handleReaderSettingsPost(req: Request): Promise<Response> {
	const { sourceId, workId, direction, offset, coverArtMode } = await req.json();
	if (!sourceId || !workId) return errorResponse(400, 'Missing sourceId or workId');
	try {
		saveReaderSettings(sourceId, workId, { direction, offset, coverArtMode });
	} catch {
		return errorResponse(404, 'Title not in library');
	}
	return json({ success: true });
}

// -- Native sources --

async function handleNativeSourceToggle(req: Request): Promise<Response> {
	const { sourceId, enabled } = await req.json();
	if (!sourceId || typeof enabled !== 'boolean') {
		return errorResponse(400, 'Missing sourceId or enabled');
	}
	const found = setNativeSourceEnabled(sourceId, enabled);
	if (!found) return errorResponse(404, 'Unknown native source');
	return json({ success: true });
}

// -- Extensions --

async function handleExtensionInstall(req: Request): Promise<Response> {
	const ext = await req.json();
	if (!ext.id || !ext.sourceCodeUrl) return errorResponse(400, 'Missing required extension fields');
	try {
		await installExtension(ext);
		clearRuntimeCache(ext.id);
		return json({ success: true });
	} catch (err) {
		console.error('Failed to install extension:', err);
		return errorResponse(500, `Failed to install extension: ${err}`);
	}
}

async function handleExtensionUninstall(req: Request): Promise<Response> {
	const { sourceId } = await req.json();
	if (!sourceId) return errorResponse(400, 'Missing sourceId');
	try {
		await uninstallExtension(sourceId);
		clearRuntimeCache(sourceId);
		return json({ success: true });
	} catch (err) {
		console.error('Failed to uninstall extension:', err);
		return errorResponse(500, `Failed to uninstall extension: ${err}`);
	}
}

// -- Thumbnail cache --

async function handleThumbnailCacheDelete(url: URL): Promise<Response> {
	const sourceId = q(url, 'sourceId');
	const workId = q(url, 'workId');
	if (sourceId && workId) return json(await clearThumbnailsForTitle(sourceId, workId));
	if (sourceId) return json(await clearThumbnailsForSource(sourceId));
	return json(await clearAllThumbnails());
}

// -- Binary image endpoints --

async function handleProxyImage(url: URL): Promise<Response> {
	const imageUrl = q(url, 'url');
	if (!imageUrl) return errorResponse(400, 'Missing url parameter');
	const referer = q(url, 'referer') ?? undefined;
	try {
		const { data, contentType } = await proxyImage(imageUrl, referer);
		return binaryResponse(data, contentType);
	} catch (err) {
		console.error('Image proxy error:', err);
		return errorResponse(502, 'Failed to fetch image');
	}
}

async function handleThumbnail(url: URL, req: Request): Promise<Response> {
	const imageUrl = q(url, 'url');
	if (!imageUrl) return errorResponse(400, 'Missing url parameter');
	const sourceId = q(url, 'sourceId') ?? '_unsorted';
	const workId = q(url, 'workId') ?? '_unknown';
	try {
		const { data, contentType } = await getThumbnail(imageUrl, sourceId, workId, req.signal);
		return binaryResponse(data, contentType, 604800);
	} catch (err: unknown) {
		if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
			return errorResponse(499, 'Request cancelled');
		}
		console.error('thumbnail: failed to generate thumbnail:', err);
		return errorResponse(502, 'Failed to generate thumbnail');
	}
}

async function handleLocalImage(url: URL): Promise<Response> {
	const filePath = q(url, 'path');
	if (!filePath) return errorResponse(400, 'Missing path');
	const entry = q(url, 'entry') ?? undefined;
	const pageIndexParam = q(url, 'pageIndex');
	const pageIndex = pageIndexParam !== null ? parseInt(pageIndexParam, 10) : undefined;
	try {
		const { data, mimeType } = await getLocalImage(filePath, entry, pageIndex);
		return binaryResponse(data, mimeType);
	} catch (err) {
		console.error('Failed to serve image:', err);
		return errorResponse(404, 'Image not found');
	}
}

async function handleSmbImage(url: URL): Promise<Response> {
	const connectionId = q(url, 'connectionId');
	const filePath = q(url, 'path');
	if (!connectionId || !filePath) return errorResponse(400, 'Missing connectionId or path');
	const entry = q(url, 'entry') ?? undefined;
	const pageIndexParam = q(url, 'pageIndex');
	const pageIndex = pageIndexParam !== null ? parseInt(pageIndexParam, 10) : undefined;
	try {
		const { data, mimeType } = await getSmbImage(connectionId, filePath, entry, pageIndex);
		return binaryResponse(data, mimeType);
	} catch (err) {
		console.error('Failed to serve SMB image:', err);
		return errorResponse(404, 'Image not found');
	}
}

// -- Source sub-routes --

async function handleSourceBrowse(url: URL, sourceId: string): Promise<Response> {
	const page = parseInt(q(url, 'page') ?? '1');
	const mode = (q(url, 'mode') ?? 'popular') as 'popular' | 'latest';
	try {
		return json(await browseSource(sourceId, page, mode));
	} catch (err) {
		console.error(`Failed to browse source ${sourceId}:`, err);
		return errorResponse(500, `Browse failed: ${err}`);
	}
}

async function handleSourceSearchGet(url: URL, sourceId: string): Promise<Response> {
	const query = q(url, 'q') ?? '';
	const page = parseInt(q(url, 'page') ?? '1');
	try {
		return json(await searchSource(sourceId, query, page));
	} catch (err) {
		console.error(`Search failed for source ${sourceId}:`, err);
		return errorResponse(500, `Search failed: ${err}`);
	}
}

async function handleSourceSearchPost(req: Request, sourceId: string): Promise<Response> {
	const body = await req.json();
	const query: string = body.query ?? '';
	const page: number = body.page ?? 1;
	const filters: SourceFilter[] = body.filters ?? [];
	try {
		return json(await searchSource(sourceId, query, page, filters));
	} catch (err) {
		console.error(`Search failed for source ${sourceId}:`, err);
		return errorResponse(500, `Search failed: ${err}`);
	}
}

async function handleSourcePages(url: URL, req: Request, sourceId: string): Promise<Response> {
	const chapterId = q(url, 'id');
	if (!chapterId) return errorResponse(400, 'Missing chapter id');
	try {
		return json(await getChapterPages(sourceId, chapterId, req.signal));
	} catch (err: unknown) {
		if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
			return errorResponse(499, 'Request cancelled');
		}
		console.error(`Failed to get pages for ${sourceId}/${chapterId}:`, err);
		return errorResponse(500, `Pages failed: ${err}`);
	}
}

async function handleSourceWork(url: URL, sourceId: string): Promise<Response> {
	const workId = q(url, 'id');
	if (!workId) return errorResponse(400, 'Missing work id');
	const fallbackTitle = q(url, 'title') ?? undefined;
	const composite = q(url, 'composite') === 'true';
	try {
		if (composite) return json(await getWorkComposite(sourceId, workId, fallbackTitle));
		return json(await getDetail(sourceId, workId, fallbackTitle));
	} catch (err) {
		console.error(`Failed to get detail for ${sourceId}/${workId}:`, err);
		return errorResponse(500, `Detail failed: ${err}`);
	}
}

async function handleSourceAlternatives(url: URL, sourceId: string): Promise<Response> {
	const title = q(url, 'title') ?? '';
	if (!title.trim()) return json({ alternatives: [] });
	try {
		return json({ alternatives: await findAlternatives(sourceId, title) });
	} catch (err) {
		console.error(`Alternatives lookup failed for source ${sourceId}:`, err);
		return errorResponse(500, `Alternatives lookup failed: ${err}`);
	}
}

function handleSourceFilters(sourceId: string): Response {
	try {
		return json(getSourceFilters(sourceId));
	} catch (err) {
		console.error(`Failed to get filters for ${sourceId}:`, err);
		return errorResponse(500, `Filters failed: ${err}`);
	}
}

async function handleChapterCover(url: URL, req: Request, sourceId: string): Promise<Response> {
	const chapterId = q(url, 'chapterId');
	if (!chapterId) return errorResponse(400, 'Missing chapterId parameter');

	const offset = Math.max(0, parseInt(q(url, 'offset') ?? '0', 10) || 0);
	const cacheKey = `${sourceId}:${chapterId}`;

	let pages = getCachedPages(cacheKey);
	if (!pages) {
		try {
			pages = await getChapterPages(sourceId, chapterId, req.signal);
		} catch (err: unknown) {
			if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
				return errorResponse(499, 'Request cancelled');
			}
			console.error(`chapter-cover: failed to get pages for ${cacheKey}:`, err);
			return errorResponse(502, 'Failed to fetch chapter pages');
		}
		setCachedPages(cacheKey, pages);
	}

	if (pages.length === 0) return errorResponse(404, 'Chapter has no pages');

	const index = Math.min(offset, pages.length - 1);
	const pageUrl = pages[index].url;
	const workId = q(url, 'workId') ?? '_unknown';

	try {
		const { data, contentType } = await getThumbnail(pageUrl, sourceId, workId, req.signal);
		return binaryResponse(data, contentType, 604800);
	} catch (err: unknown) {
		if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
			return errorResponse(499, 'Request cancelled');
		}
		console.error(`chapter-cover: failed to generate thumbnail for ${cacheKey}:`, err);
		return errorResponse(502, 'Failed to generate chapter thumbnail');
	}
}

// -- Metadata --

async function handleMetadataSearch(url: URL): Promise<Response> {
	const provider = q(url, 'provider') as 'mangaupdates' | 'anilist' | 'comicvine' | null;
	const query = q(url, 'query');
	if (!provider || !query) return errorResponse(400, 'Missing provider or query');
	try {
		const results = await searchMetadata(provider, query);
		return json(results);
	} catch (err: unknown) {
		return errorResponse(500, err instanceof Error ? err.message : 'Search failed');
	}
}

function handleMetadataStatusGet(url: URL): Response {
	const sourceId = q(url, 'sourceId');
	const workId = q(url, 'workId');
	if (!sourceId || !workId) return errorResponse(400, 'Missing sourceId or workId');
	return json(getMetadataStatus(sourceId, workId));
}

async function handleMetadataFetch(req: Request): Promise<Response> {
	const { sourceId, workId } = await req.json() as { sourceId: string; workId: string };
	if (!sourceId || !workId) return errorResponse(400, 'Missing sourceId or workId');
	try {
		const result = await fetchMetadata(sourceId, workId, req.signal);
		return json(result);
	} catch (err: unknown) {
		return errorResponse(500, err instanceof Error ? err.message : 'Fetch failed');
	}
}

async function handleMetadataFetchLibrary(req: Request): Promise<Response> {
	const { libraryId } = await req.json() as { libraryId?: string };
	try {
		const result = await fetchLibraryMetadata(libraryId, req.signal);
		return json(result);
	} catch (err: unknown) {
		return errorResponse(500, err instanceof Error ? err.message : 'Bulk fetch failed');
	}
}

async function handleMetadataLink(req: Request): Promise<Response> {
	const { sourceId, workId, provider, providerId } = await req.json() as {
		sourceId: string; workId: string; provider: 'mangaupdates' | 'anilist' | 'comicvine'; providerId: string;
	};
	if (!sourceId || !workId || !provider || !providerId) {
		return errorResponse(400, 'Missing required fields');
	}
	try {
		const meta = await linkMetadata(sourceId, workId, provider, providerId, req.signal);
		return json(meta);
	} catch (err: unknown) {
		return errorResponse(500, err instanceof Error ? err.message : 'Link failed');
	}
}

function handleMetadataUnlink(url: URL): Response {
	const sourceId = q(url, 'sourceId');
	const workId = q(url, 'workId');
	if (!sourceId || !workId) return errorResponse(400, 'Missing sourceId or workId');
	unlinkMetadata(sourceId, workId);
	return json({ success: true });
}

async function handleMetadataOverridesSave(req: Request): Promise<Response> {
	const { sourceId, workId, overrides } = await req.json() as {
		sourceId: string; workId: string; overrides: Record<string, string> | null;
	};
	if (!sourceId || !workId) return errorResponse(400, 'Missing sourceId or workId');

	const libEntry = db.select({ id: library.id })
		.from(library)
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.get();

	if (!libEntry) return errorResponse(404, 'Work not in library');

	// Clean up: remove fields set to null/empty, store null if no overrides
	let cleaned: string | null = null;
	if (overrides && Object.keys(overrides).length > 0) {
		const filtered: Record<string, string> = {};
		for (const [k, v] of Object.entries(overrides)) {
			if (v === 'local' || v === 'online') filtered[k] = v;
		}
		cleaned = Object.keys(filtered).length > 0 ? JSON.stringify(filtered) : null;
	}

	const updates: Record<string, unknown> = { metadataOverrides: cleaned };

	// If coverUrl override changed, sync the library entry's coverUrl
	const parsedOverrides = cleaned ? JSON.parse(cleaned) : null;
	if (parsedOverrides?.coverUrl === 'online') {
		// Use online metadata cover
		const meta = db.select({ coverUrl: onlineMetadata.coverUrl })
			.from(onlineMetadata)
			.where(and(eq(onlineMetadata.sourceId, sourceId), eq(onlineMetadata.workId, workId)))
			.get();
		if (meta?.coverUrl) updates.coverUrl = meta.coverUrl;
	}

	db.update(library)
		.set(updates)
		.where(eq(library.id, libEntry.id))
		.run();

	return json({ success: true });
}
