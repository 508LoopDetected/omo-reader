/**
 * Root app model — tab+column layout with Elm architecture.
 *
 * Replaces the view-stack model with persistent tabs, Miller columns,
 * and floating overlays.
 */

import { termSize, type Msg, type Dispatch, type Program } from './tea.js';
import type { KeyMsg } from './keys.js';
import * as api from './api.js';
import {
	renderTabBar, computeColumnWidths, renderOverlay, mergeColumns,
	icons, type TabBarItem,
} from './layout.js';
import { statusBar, colors } from './ui.js';
import type { AppManifest } from './manifest.js';
import { getManifest, invalidateCache } from './manifest.js';
import * as library from './views/library.js';
import * as sources from './views/sources.js';
import * as browse from './views/browse.js';
import * as search from './views/search.js';
import * as settings from './views/settings.js';
import * as extensions from './views/extensions.js';
import {
	type OverlayState, updateOverlay, viewOverlay,
	initConfirm, initCreateForm,
	initChapterBrowser, loadChapterBrowser,
} from './views/overlays.js';

async function openReader(url: string): Promise<void> {
	// Spawn reader as a subprocess so webview.run() doesn't block
	// the main process's event loop (HTTP server needs to stay responsive).
	// main.ts handles the --reader flag and delegates to reader.ts.
	const isScript = process.argv.length > 1 && !process.argv[1].startsWith('-');
	const baseCmd = isScript ? [process.execPath, process.argv[1]] : [process.execPath];
	const { spawn } = await import('node:child_process');
	await new Promise<void>((resolve) => {
		const proc = spawn(baseCmd[0], [...baseCmd.slice(1), '--reader', url], {
			stdio: 'inherit',
		});
		proc.on('close', () => resolve());
	});
}

// ── Tab & Column Types ──

type TabId = 'library' | 'sources' | 'search' | 'extensions' | 'settings';

interface ColumnDef {
	type: string;
	minWidth: number;
	growWeight: number;
}

interface Tab {
	id: TabId;
	label: string;
	icon: string;
	shortcut: string;
	columns: ColumnDef[];
	defaultColumns: ColumnDef[];
	focusedColumn: number;
	loaded: boolean;
	stale: boolean;
}

const TABS: Array<{ id: TabId; label: string; icon: string; shortcut: string }> = [
	{ id: 'library',    label: 'Lib',    icon: icons.library, shortcut: '1' },
	{ id: 'sources',    label: 'Src',    icon: icons.sources, shortcut: '2' },
	{ id: 'search',     label: 'Find',   icon: icons.search,  shortcut: '3' },
	{ id: 'extensions', label: 'Ext',    icon: icons.puzzle,  shortcut: '4' },
	{ id: 'settings',   label: 'Config', icon: icons.info,    shortcut: '5' },
];

const DEFAULT_COLUMNS: Record<TabId, ColumnDef[]> = {
	library: [
		{ type: 'scopeList', minWidth: 18, growWeight: 15 },
		{ type: 'libraryList', minWidth: 30, growWeight: 75 },
	],
	sources: [
		{ type: 'sourceList', minWidth: 25, growWeight: 40 },
		{ type: 'sourceInfo', minWidth: 25, growWeight: 60 },
	],
	search: [
		{ type: 'searchResults', minWidth: 30, growWeight: 45 },
		{ type: 'workPreview', minWidth: 25, growWeight: 55 },
	],
	extensions: [
		{ type: 'extensionList', minWidth: 40, growWeight: 100 },
	],
	settings: [
		{ type: 'sectionList', minWidth: 25, growWeight: 35 },
		{ type: 'sectionDetail', minWidth: 30, growWeight: 65 },
	],
};

function createTab(id: TabId, label: string, icon: string, shortcut: string): Tab {
	const cols = DEFAULT_COLUMNS[id];
	return {
		id, label, icon, shortcut,
		columns: [...cols],
		defaultColumns: cols,
		focusedColumn: 0,
		loaded: false,
		stale: false,
	};
}

// ── App Model ──

export type NsfwMode = 'sfw' | 'all' | 'nsfw';
const NSFW_CYCLE: NsfwMode[] = ['sfw', 'all', 'nsfw'];
const NSFW_LABELS: Record<NsfwMode, string> = { sfw: 'SFW', all: 'All', nsfw: 'NSFW' };

export interface AppModel {
	tabs: Tab[];
	activeTab: number;
	manifest: AppManifest | null;
	nsfwMode: NsfwMode;
	// Sub-models (flat, not nested in columns)
	libraryModel: library.LibraryModel;
	sourcesModel: sources.SourcesModel;
	browseModel: browse.BrowseModel;
	searchModel: search.SearchModel;
	settingsModel: settings.SettingsModel;
	extensionsModel: extensions.ExtensionsModel;
	// Overlay
	overlay: OverlayState;
	// Terminal
	cols: number;
	rows: number;
	suspended: boolean;
	__quit?: boolean;
}

// ── Helpers ──

function activeTabObj(model: AppModel): Tab {
	return model.tabs[model.activeTab];
}

function updateTab(model: AppModel, tab: Tab): AppModel {
	const tabs = [...model.tabs];
	tabs[model.activeTab] = tab;
	return { ...model, tabs };
}

/** Check if a text input is currently focused (prevents global shortcut interception). */
function isTextInputActive(model: AppModel): boolean {
	const tab = activeTabObj(model);
	if (tab.id === 'search' && model.searchModel.inputFocused) return true;
	if (tab.id === 'extensions' && model.extensionsModel.inputFocused) return true;
	return false;
}

// ── Focusable Column Helpers ──

const NON_FOCUSABLE = new Set(['workPreview', 'sourceInfo']);

function findPrevFocusable(columns: ColumnDef[], current: number): number {
	for (let i = current - 1; i >= 0; i--) {
		if (!NON_FOCUSABLE.has(columns[i].type)) return i;
	}
	return current;
}

function findNextFocusable(columns: ColumnDef[], current: number): number {
	for (let i = current + 1; i < columns.length; i++) {
		if (!NON_FOCUSABLE.has(columns[i].type)) return i;
	}
	return current;
}

function findNextFocusableWrap(columns: ColumnDef[], current: number): number {
	// Search forward from current+1, wrapping around
	for (let offset = 1; offset < columns.length; offset++) {
		const i = (current + offset) % columns.length;
		if (!NON_FOCUSABLE.has(columns[i].type)) return i;
	}
	return current;
}

// ── Drill-down ──

/** Open the chapter browser overlay for a work. */
function openChapterBrowser(model: AppModel, sourceId: string, workId: string, title: string, dispatch: Dispatch<AppModel>): AppModel {
	const cbModel = initChapterBrowser(sourceId, workId, title);
	const m = { ...model, overlay: { type: 'chapterBrowser' as const, model: cbModel } };
	// Load data outside of dispatch — dispatch reads model immediately (before
	// this function's return value is assigned), so the overlay guard would fail.
	// By the time the API call completes, model will be updated.
	loadChapterBrowser(cbModel).then((loaded) => {
		dispatch(async (current) => {
			if (current.overlay?.type !== 'chapterBrowser') return current;
			return { ...current, overlay: { type: 'chapterBrowser' as const, model: loaded } };
		});
	});
	return m;
}

function drillToBrowse(model: AppModel, sourceId: string, sourceName: string): AppModel {
	const bm = browse.init(sourceId, sourceName);
	const tab = activeTabObj(model);
	const newColumns: ColumnDef[] = [
		{ type: 'sourceList', minWidth: 15, growWeight: 20 },
		{ type: 'browseList', minWidth: 25, growWeight: 40 },
		{ type: 'workPreview', minWidth: 20, growWeight: 40 },
	];
	const newTab = { ...tab, columns: newColumns, focusedColumn: 1 };
	return updateTab({ ...model, browseModel: bm }, newTab);
}

function popColumn(model: AppModel): AppModel {
	const tab = activeTabObj(model);
	if (tab.columns.length <= tab.defaultColumns.length) {
		return model; // At default, can't pop further
	}

	// Restore to previous column state
	const newColumns = tab.columns.slice(0, tab.defaultColumns.length);
	let clampedFocus = Math.min(tab.focusedColumn, newColumns.length - 1);
	// Ensure we land on a focusable column
	while (clampedFocus > 0 && NON_FOCUSABLE.has(newColumns[clampedFocus].type)) {
		clampedFocus--;
	}
	const newTab = { ...tab, columns: newColumns, focusedColumn: clampedFocus };
	return updateTab(model, newTab);
}

// ── Column Update Routing ──

async function updateFocusedColumn(model: AppModel, key: KeyMsg, dispatch: Dispatch<AppModel>): Promise<AppModel> {
	const tab = activeTabObj(model);
	const col = tab.columns[tab.focusedColumn];
	if (!col) return model;

	switch (col.type) {
		case 'scopeList': {
			const result = library.updateScopeColumn(model.libraryModel, key);
			let m = { ...model, libraryModel: result.model };

			if (result.asyncFn) {
				const loaded = await result.asyncFn();
				m = { ...m, libraryModel: loaded };
			}

			if (result.action?.type === 'pass') {
				// Enter should focus the list column (same as l/right)
				if (key.key === 'enter' || key.key === 'l' || key.key === 'right') {
					const tab = activeTabObj(m);
					const next = findNextFocusable(tab.columns, tab.focusedColumn);
					if (next !== tab.focusedColumn) {
						return updateTab(m, { ...tab, focusedColumn: next });
					}
					return m;
				}
				return handleGlobalKey(m, key);
			}
			return m;
		}

		case 'libraryList': {
			const result = library.updateColumn(model.libraryModel, key);
			let m = { ...model, libraryModel: result.model };

			if (result.asyncFn) {
				const loaded = await result.asyncFn();
				m = { ...m, libraryModel: loaded };
			}

			if (result.action) {
				switch (result.action.type) {
					case 'detail':
						return openChapterBrowser(m, result.action.sourceId, result.action.workId, result.action.title, dispatch);
					case 'pass':
						return handleGlobalKey(model, key);
				}
			}
			return m;
		}

		case 'sourceList': {
			const result = sources.updateColumn(model.sourcesModel, key);
			let m = { ...model, sourcesModel: result.model };

			if (result.action) {
				switch (result.action.type) {
					case 'browse':
						m = drillToBrowse(m, result.action.sourceId, result.action.sourceName);
						m = { ...m, browseModel: await browse.load(m.browseModel) };
						break;
					case 'pass':
						return handleGlobalKey(model, key);
				}
			}
			return m;
		}

		case 'browseList': {
			const result = browse.updateColumn(model.browseModel, key);
			let m = { ...model, browseModel: result.model };

			if (result.reload) {
				const loaded = await browse.load(result.model);
				m = { ...m, browseModel: loaded };
			}

			if (result.action) {
				switch (result.action.type) {
					case 'detail':
						return openChapterBrowser(m, result.action.sourceId, result.action.workId, result.action.title, dispatch);
					case 'pass':
						return handleGlobalKey(model, key);
				}
			}
			return m;
		}

		case 'searchResults': {
			const result = search.updateColumn(model.searchModel, key);
			let m = { ...model, searchModel: result.model };

			if (result.doSearch) {
				const loaded = await search.doSearch(result.model);
				m = { ...m, searchModel: loaded };
			}

			if (result.action) {
				switch (result.action.type) {
					case 'detail':
						return openChapterBrowser(m, result.action.sourceId, result.action.workId, result.action.title, dispatch);
					case 'pass':
						return handleGlobalKey(model, key);
				}
			}
			return m;
		}

		case 'extensionList': {
			const result = extensions.updateColumn(model.extensionsModel, key);
			let m = { ...model, extensionsModel: result.model };

			if (result.asyncFn) {
				const loaded = await result.asyncFn();
				m = { ...m, extensionsModel: loaded };
			}

			if (result.action?.type === 'pass') {
				return handleGlobalKey(model, key);
			}
			return m;
		}

		case 'sectionList': {
			const result = settings.updateSectionsColumn(model.settingsModel, key);
			let m = { ...model, settingsModel: result.model };

			// If enter/l/right was pressed and section changed, auto-focus detail
			if ((key.key === 'enter' || key.key === 'l' || key.key === 'right') && result.action === null) {
				const tab = activeTabObj(m);
				const detailIdx = tab.columns.findIndex(c => c.type === 'sectionDetail');
				if (detailIdx >= 0) {
					m = updateTab(m, { ...tab, focusedColumn: detailIdx });
				}
			}

			if (result.action?.type === 'pass') {
				return handleGlobalKey(model, key);
			}
			return m;
		}

		case 'sectionDetail': {
			const result = settings.updateDetailColumn(model.settingsModel, key);
			let m = { ...model, settingsModel: result.model };

			if (result.asyncFn) {
				const loaded = await result.asyncFn();
				m = { ...m, settingsModel: loaded };
			}

			if (result.action) {
				switch (result.action.type) {
					case 'openConfirm':
						m = {
							...m,
							overlay: {
								type: 'confirm',
								model: initConfirm(
									result.action.message,
									result.action.action,
									result.action.action.dangerous ?? false,
									result.action.itemId,
								),
							},
						};
						break;
					case 'openCreateForm':
						m = {
							...m,
							overlay: {
								type: 'createForm',
								model: initCreateForm(
									result.action.fields,
									result.action.endpoint,
									result.action.title,
								),
							},
						};
						break;
					case 'pass':
						return handleGlobalKey(model, key);
				}
			}
			return m;
		}

		// workPreview and sourceInfo are passive — don't handle input
		case 'workPreview':
		case 'sourceInfo':
			return handleGlobalKey(model, key);

		default:
			return handleGlobalKey(model, key);
	}
}

/** Handle keys that weren't consumed by the focused column. */
function handleGlobalKey(model: AppModel, key: KeyMsg): AppModel {
	switch (key.key) {
		case 'h':
		case 'left': {
			const tab = activeTabObj(model);
			const prev = findPrevFocusable(tab.columns, tab.focusedColumn);
			if (prev !== tab.focusedColumn) {
				return updateTab(model, { ...tab, focusedColumn: prev });
			}
			return model;
		}
		case 'l':
		case 'right': {
			const tab = activeTabObj(model);
			const next = findNextFocusable(tab.columns, tab.focusedColumn);
			if (next !== tab.focusedColumn) {
				return updateTab(model, { ...tab, focusedColumn: next });
			}
			return model;
		}
		case 'tab': {
			const tab = activeTabObj(model);
			const next = findNextFocusableWrap(tab.columns, tab.focusedColumn);
			return updateTab(model, { ...tab, focusedColumn: next });
		}
		case 'escape': {
			const tab = activeTabObj(model);
			// If drilled beyond default, pop columns
			if (tab.columns.length > tab.defaultColumns.length) {
				return popColumn(model);
			}
			// Otherwise, move focus to leftmost focusable column
			const leftmost = findNextFocusable(tab.columns, -1);
			if (leftmost !== tab.focusedColumn) {
				return updateTab(model, { ...tab, focusedColumn: leftmost });
			}
			return model;
		}
		case 'q':
			if (!isTextInputActive(model)) {
				return { ...model, __quit: true };
			}
			return model;
		default:
			return model;
	}
}

// ── Tab Loading ──

async function loadTab(model: AppModel, tabId: TabId): Promise<AppModel> {
	switch (tabId) {
		case 'library': {
			const loaded = await library.loadScope(model.libraryModel);
			return { ...model, libraryModel: loaded };
		}
		case 'sources': {
			const loaded = await sources.load(model.sourcesModel);
			return { ...model, sourcesModel: loaded };
		}
		case 'search':
			return model; // Search loads on demand
		case 'extensions': {
			const loaded = await extensions.load(model.extensionsModel);
			return { ...model, extensionsModel: loaded };
		}
		case 'settings': {
			const loaded = await settings.load(model.settingsModel);
			return { ...model, settingsModel: loaded };
		}
	}
}

// ── Overlay Action Handling ──

async function handleOverlayAction(model: AppModel, action: NonNullable<ReturnType<typeof updateOverlay>['action']>): Promise<AppModel> {
	if (!action || action.type === 'close') return model;

	switch (action.type) {
		case 'confirm': {
			const confirmAction = action.action;
			if (confirmAction.key === 'delete') {
				const ms = model.settingsModel.currentManagement;
				if (ms) {
					const item = ms.items[model.settingsModel.selectedItem];
					if (item) {
						const itemId = String(item.id ?? '');
						try {
							const url = new URL(`${ms.endpoints.delete}?id=${encodeURIComponent(itemId)}`, api.getBaseUrl());
							await fetch(url.toString(), { method: 'DELETE' });
							return {
								...model,
								settingsModel: { ...model.settingsModel, statusMessage: 'Deleted' },
							};
						} catch {
							return {
								...model,
								settingsModel: { ...model.settingsModel, statusMessage: 'Delete failed' },
							};
						}
					}
				}
			} else {
				try {
					const method = confirmAction.method ?? 'POST';
					const url = new URL(confirmAction.endpoint, api.getBaseUrl());
					await fetch(url.toString(), { method });
					return {
						...model,
						settingsModel: { ...model.settingsModel, statusMessage: `${confirmAction.label}: done` },
					};
				} catch {
					return {
						...model,
						settingsModel: { ...model.settingsModel, statusMessage: `${confirmAction.label}: failed` },
					};
				}
			}
			return model;
		}
		case 'submitForm': {
			try {
				const url = new URL(action.endpoint, api.getBaseUrl());
				const res = await fetch(url.toString(), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(action.data),
				});
				if (!res.ok) {
					const err = await res.json().catch(() => ({ message: 'Failed' }));
					return {
						...model,
						settingsModel: { ...model.settingsModel, statusMessage: `Error: ${err.message ?? 'Failed'}` },
					};
				}
				return {
					...model,
					settingsModel: { ...model.settingsModel, statusMessage: 'Created successfully' },
				};
			} catch (err) {
				return {
					...model,
					settingsModel: { ...model.settingsModel, statusMessage: `Error: ${err}` },
				};
			}
		}
	}

	return model;
}

// ── Column View Rendering ──

function renderColumn(model: AppModel, colDef: ColumnDef, width: number, height: number, focused: boolean): string[] {
	switch (colDef.type) {
		case 'scopeList':
			return library.viewScopeColumn(model.libraryModel, width, height, focused);
		case 'libraryList':
			return library.viewListColumn(model.libraryModel, width, height, focused);
		case 'workPreview': {
			// Determine which work to preview based on active tab
			const tab = activeTabObj(model);
			if (tab.id === 'sources') {
				return browse.viewPreviewColumn(model.browseModel, width, height, focused);
			} else if (tab.id === 'search') {
				return search.viewPreviewColumn(model.searchModel, width, height, focused);
			}
			return browse.viewPreviewColumn(model.browseModel, width, height, focused);
		}
		case 'sourceList':
			return sources.viewListColumn(model.sourcesModel, width, height, focused);
		case 'sourceInfo':
			return sources.viewInfoColumn(model.sourcesModel, width, height, focused);
		case 'browseList':
			return browse.viewListColumn(model.browseModel, width, height, focused);
		case 'searchResults':
			return search.viewResultsColumn(model.searchModel, width, height, focused);
		case 'extensionList':
			return extensions.viewListColumn(model.extensionsModel, width, height, focused);
		case 'sectionList':
			return settings.viewSectionsColumn(model.settingsModel, width, height, focused);
		case 'sectionDetail':
			return settings.viewDetailColumn(model.settingsModel, width, height, focused);
		default:
			return [];
	}
}

/** Build status bar hints for the currently focused column. */
function buildStatusHints(model: AppModel): string[] {
	const tab = activeTabObj(model);
	const col = tab.columns[tab.focusedColumn];
	if (!col) return [];

	const hints: string[] = [];

	switch (col.type) {
		case 'scopeList':
			hints.push('\u2191\u2193 navigate', 'Enter select');
			break;
		case 'libraryList':
			hints.push('\u2191\u2193 navigate', 'Enter detail', 's sort', 'd remove');
			break;
		case 'sourceList':
			hints.push('\u2191\u2193 navigate', 'Enter browse');
			break;
		case 'browseList':
			hints.push('\u2191\u2193 navigate', 'Enter detail', 'n/p page', 't mode');
			break;
		case 'searchResults':
			if (model.searchModel.inputFocused) {
				hints.push('Enter search', 'Tab results');
			} else {
				hints.push('\u2191\u2193 navigate', 'Enter detail', '/ input');
			}
			break;
		case 'extensionList':
			hints.push('\u2191\u2193 navigate', 'Enter install', '/ search', 'l lang');
			break;
		case 'sectionList':
			hints.push('\u2191\u2193 navigate', 'Enter open');
			break;
		case 'sectionDetail': {
			const section = model.settingsModel.sections[model.settingsModel.selectedSection];
			if (section?.kind === 'appSettings') {
				hints.push('\u2191\u2193 navigate', '\u2190\u2192 change');
			} else {
				hints.push('\u2191\u2193 navigate');
				const ms = model.settingsModel.currentManagement;
				if (ms?.createFields?.length) hints.push('n new');
				if (ms?.endpoints.delete) hints.push('d delete');
			}
			break;
		}
	}

	// Global hints
	const hasPrev = findPrevFocusable(tab.columns, tab.focusedColumn) !== tab.focusedColumn;
	const hasNext = findNextFocusable(tab.columns, tab.focusedColumn) !== tab.focusedColumn;
	if (hasPrev) hints.push('h \u2190');
	if (hasNext) hints.push('l \u2192');
	if (tab.columns.length > tab.defaultColumns.length) hints.push('Esc back');
	const nsfwLabel = NSFW_LABELS[model.nsfwMode];
	hints.push(model.nsfwMode === 'nsfw' ? `0 ${colors.statusNsfw(nsfwLabel)}` : `0 ${nsfwLabel}`);
	hints.push('q quit');

	return hints;
}

// ── Program ──

export function createProgram(manifest?: AppManifest | null): Program<AppModel> {
	const size = termSize();
	const m = manifest ?? null;

	return {
		init(): AppModel {
			const tabs = TABS.map(t => createTab(t.id, t.label, t.icon, t.shortcut));

			return {
				tabs,
				activeTab: 0,
				manifest: m,
				nsfwMode: 'sfw' as NsfwMode,
				libraryModel: library.init(m, undefined, undefined, 'sfw'),
				sourcesModel: sources.init(),
				browseModel: browse.init('', ''),
				searchModel: search.init(),
				settingsModel: settings.init(m),
				extensionsModel: extensions.init(),
				overlay: null,
				cols: size.cols,
				rows: size.rows,
				suspended: false,
			};
		},

		initCmd(dispatch) {
			dispatch(async (model) => {
				// Load NSFW mode from settings
				const appSettings = await api.getAppSettings();
				const saved = appSettings['browse.nsfwMode'];
				const nsfwMode: NsfwMode = (saved === 'nsfw' || saved === 'all') ? saved : 'sfw';

				// Rebuild library scopes with correct NSFW filtering
				const newLibModel = library.init(model.manifest, undefined, undefined, nsfwMode);
				let m = { ...model, nsfwMode, libraryModel: { ...newLibModel, sortBy: model.libraryModel.sortBy } };

				const tab = activeTabObj(m);
				if (!tab.loaded) {
					const loaded = await loadTab(m, tab.id);
					const tabs = [...loaded.tabs];
					tabs[loaded.activeTab] = { ...tabs[loaded.activeTab], loaded: true };
					return { ...loaded, tabs };
				}
				return m;
			});
		},

		async update(model: AppModel, msg: Msg, dispatch: Dispatch<AppModel>): Promise<AppModel> {
			// Handle resize
			if (msg.type === 'resize') {
				return { ...model, cols: msg.cols, rows: msg.rows };
			}

			// Ignore input while reader is open
			if (model.suspended && msg.type === 'key') {
				return model;
			}

			if (msg.type !== 'key') return model;
			const key = msg as KeyMsg;

			// Lazy-load fallback (initCmd handles normal case)
			const currentTab = activeTabObj(model);
			if (!currentTab.loaded) {
				const loaded = await loadTab(model, currentTab.id);
				const tabs = [...loaded.tabs];
				tabs[loaded.activeTab] = { ...tabs[loaded.activeTab], loaded: true };
				return { ...loaded, tabs };
			}

			// 1. Overlay routing
			if (model.overlay) {
				const wasChapterBrowser = model.overlay.type === 'chapterBrowser';
				const result = updateOverlay(model.overlay, key);
				let m = { ...model, overlay: result.overlay };

				// Handle async operations from chapter browser
				if (result.asyncFn) {
					const asyncFn = result.asyncFn;
					dispatch(async (current) => {
						if (!current.overlay) return current;
						const newOverlay = await asyncFn();
						return { ...current, overlay: newOverlay };
					});
				}

				if (result.action) {
					switch (result.action.type) {
						case 'close':
							// Reload current tab to reflect any changes made in overlays
							if (wasChapterBrowser) {
								m = await loadTab(m, activeTabObj(m).id);
							}
							break;
						case 'readChapter': {
							const { sourceId: sid, workId: mid, chapterId: cid } = result.action;
							const readerUrl = `${api.getBaseUrl()}/reader?sourceId=${encodeURIComponent(sid)}&workId=${encodeURIComponent(mid)}&chapterId=${encodeURIComponent(cid)}`;
							m = { ...m, suspended: true };
							dispatch(async (current) => {
								await openReader(readerUrl);
								// Reload chapter browser after reader closes
								if (current.overlay?.type === 'chapterBrowser') {
									const reloaded = await loadChapterBrowser(current.overlay.model);
									return { ...current, overlay: { type: 'chapterBrowser', model: reloaded }, suspended: false };
								}
								return { ...current, suspended: false };
							});
							break;
						}
						default:
							m = await handleOverlayAction(m, result.action);
							break;
					}
				}

				return m;
			}

			// 2. Tab switching (1-5, not in text input)
			if (!isTextInputActive(model)) {
				const tabIdx = TABS.findIndex(t => t.shortcut === key.key);
				if (tabIdx >= 0 && tabIdx !== model.activeTab) {
					let m = { ...model, activeTab: tabIdx };
					const tab = m.tabs[tabIdx];
					if (!tab.loaded || tab.stale) {
						m = await loadTab(m, tab.id);
						const tabs = [...m.tabs];
						tabs[tabIdx] = { ...tabs[tabIdx], loaded: true, stale: false };
						m = { ...m, tabs };
					}
					return m;
				}

				// NSFW mode toggle (0)
				if (key.key === '0') {
					const idx = NSFW_CYCLE.indexOf(model.nsfwMode);
					const next = NSFW_CYCLE[(idx + 1) % NSFW_CYCLE.length];
					// Mark all loaded tabs as stale so they reload with the new filter
					const tabs = model.tabs.map(t => t.loaded ? { ...t, stale: true } : t);
					await api.saveAppSettings({ 'browse.nsfwMode': next });
					// Refetch manifest so library nsfw flags are current
					invalidateCache();
					const freshManifest = await getManifest();
					// Rebuild library scopes with fresh manifest + new nsfw mode
					const newLibModel = library.init(freshManifest, undefined, undefined, next);
					let m = { ...model, nsfwMode: next, tabs, manifest: freshManifest, libraryModel: { ...newLibModel, sortBy: model.libraryModel.sortBy } };
					// Reload the active tab immediately
					const activeTab = m.tabs[m.activeTab];
					m = await loadTab(m, activeTab.id);
					const refreshedTabs = [...m.tabs];
					refreshedTabs[m.activeTab] = { ...refreshedTabs[m.activeTab], stale: false };
					return { ...m, nsfwMode: next, tabs: refreshedTabs };
				}
			}

			// 3. Route to focused column handler (includes global key fallback)
			return updateFocusedColumn(model, key, dispatch);
		},

		view(model: AppModel): string {
			if (model.suspended) {
				const lines: string[] = [];
				for (let i = 0; i < model.rows - 1; i++) lines.push('');
				const msg = '  Reading in viewer... (close the reader window to return)';
				lines[Math.floor(model.rows / 2)] = msg;
				return lines.join('\n');
			}

			const tab = activeTabObj(model);
			const tabBarItems: TabBarItem[] = model.tabs.map(t => ({
				label: t.label,
				shortcut: t.shortcut,
				icon: t.icon,
			}));

			// 1. Tab bar (dynamic height)
			const tabBarLines = renderTabBar(tabBarItems, model.activeTab, model.cols, model.rows);

			// 2. Columns
			const columnHeight = model.rows - tabBarLines.length - 1; // tab bar + status bar
			const widths = computeColumnWidths(
				tab.columns.map(c => ({ minWidth: c.minWidth, growWeight: c.growWeight })),
				model.cols,
				tab.focusedColumn,
			);

			const columnLines: string[][] = [];
			for (let i = 0; i < tab.columns.length; i++) {
				if (widths[i] <= 0) continue;
				const focused = i === tab.focusedColumn;
				const rendered = renderColumn(model, tab.columns[i], widths[i], columnHeight, focused);
				columnLines.push(rendered);
			}

			const bodyLines = mergeColumns(columnLines);

			// 3. Status bar
			const hints = buildStatusHints(model);
			const statusLine = statusBar(hints, model.cols);

			// 4. Compose
			let lines = [...tabBarLines, ...bodyLines];

			// Ensure we have exactly rows - 1 lines before status bar
			while (lines.length < model.rows - 1) {
				lines.push('');
			}
			if (lines.length > model.rows - 1) {
				lines = lines.slice(0, model.rows - 1);
			}
			lines.push(statusLine);

			// 5. Overlay compositing
			if (model.overlay) {
				const overlayLines = viewOverlay(model.overlay, model.cols, model.rows);
				if (overlayLines) {
					lines = renderOverlay(lines, overlayLines, model.cols, model.rows);
				}
			}

			return lines.join('\n');
		},
	};
}
