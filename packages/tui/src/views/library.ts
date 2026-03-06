/**
 * Library view — list of saved works with preview panel.
 */

import * as api from '../api.js';
import type { EnrichedLibraryEntry } from '../api.js';
import { colors, statusBar, listWindow, truncate, loadingLine, stripAnsi } from '../ui.js';
import { renderPanel, sideBySide, computeSplitLayout, padAnsi, workPreview, icons } from '../layout.js';
import type { Msg, KeyMsg } from '../tea.js';
import type { AppManifest, ControlDef } from '../manifest.js';
import { getTuiControls, cycleControlValue, getControlLabel } from '../manifest.js';

export interface LibraryScope {
	id: string;
	label: string;
	kind: 'all' | 'library' | 'collection';
}

export interface LibraryModel {
	items: EnrichedLibraryEntry[];
	selected: number;
	loading: boolean;
	error: string | null;
	sortBy: string;
	sortControl: ControlDef | null;
	libraryId?: string;
	libraryName?: string;
	// Scope column
	scopes: LibraryScope[];
	scopeIndex: number;
	loadedScopeIndex: number;
}

export type NsfwMode = 'sfw' | 'all' | 'nsfw';

export function init(manifest?: AppManifest | null, libraryId?: string, libraryName?: string, nsfwMode?: NsfwMode): LibraryModel {
	const viewId = libraryId ? 'libraryById' : 'library';
	const controls = manifest ? getTuiControls(manifest, viewId) : [];
	const sortControl = controls.find(c => c.key === 'sort') ?? null;

	// Build scope list from manifest, filtering NSFW libraries by mode
	const scopes: LibraryScope[] = [{ id: '', label: 'All Titles', kind: 'all' }];
	if (manifest) {
		const mode = nsfwMode ?? 'sfw';
		for (const lib of manifest.nav.libraries) {
			const libNsfw = 'nsfw' in lib && lib.nsfw;
			if (mode === 'sfw' && libNsfw) continue;
			if (mode === 'nsfw' && !libNsfw) continue;
			scopes.push({ id: lib.id, label: lib.label, kind: 'library' });
		}
		for (const col of manifest.nav.collections) {
			scopes.push({ id: col.id, label: col.label, kind: 'collection' });
		}
	}

	const scopeIndex = libraryId ? scopes.findIndex(s => s.id === libraryId) : 0;

	const resolvedIdx = Math.max(0, scopeIndex);
	return {
		items: [],
		selected: 0,
		loading: true,
		error: null,
		sortBy: sortControl?.defaultValue ?? 'recent',
		sortControl,
		libraryId,
		libraryName,
		scopes,
		scopeIndex: resolvedIdx,
		loadedScopeIndex: resolvedIdx,
	};
}

export async function load(model: LibraryModel): Promise<LibraryModel> {
	try {
		const items = await api.getLibraryEnriched({
			sort: model.sortBy,
			libraryId: model.libraryId,
		});
		return { ...model, items, loading: false, error: null };
	} catch (err) {
		return { ...model, loading: false, error: String(err) };
	}
}

export type LibraryAction =
	| { type: 'detail'; sourceId: string; workId: string; title: string }
	| { type: 'back' }
	| null;

export function update(model: LibraryModel, msg: Msg): { model: LibraryModel; action: LibraryAction; asyncFn?: () => Promise<LibraryModel> } {
	if (msg.type !== 'key') return { model, action: null };
	const key = msg as KeyMsg;

	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selected: Math.min(model.selected + 1, Math.max(0, model.items.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selected: Math.max(model.selected - 1, 0) },
				action: null,
			};
		case 'enter': {
			const item = model.items[model.selected];
			if (!item) return { model, action: null };
			return { model, action: { type: 'detail', sourceId: item.sourceId, workId: item.workId, title: item.title } };
		}
		case 'd': {
			const item = model.items[model.selected];
			if (!item) return { model, action: null };
			const newModel = { ...model, loading: true };
			return {
				model: newModel,
				action: null,
				asyncFn: async () => {
					await api.removeFromLibrary(item.sourceId, item.workId);
					return load(newModel);
				},
			};
		}
		case 's': {
			const next = model.sortControl
				? cycleControlValue(model.sortControl, model.sortBy)
				: (model.sortBy === 'recent' ? 'title' : model.sortBy === 'title' ? 'added' : 'recent');
			const newModel = { ...model, sortBy: next, loading: true };
			return {
				model: newModel,
				action: null,
				asyncFn: () => load(newModel),
			};
		}
		case 'q':
		case 'escape':
			return { model, action: { type: 'back' } };
		default:
			return { model, action: null };
	}
}

export function view(model: LibraryModel, cols: number, rows: number): string {
	const lines: string[] = [];
	const narrow = cols < 60;

	const layout = computeSplitLayout(cols, rows, 0.45, 0, 1);
	const sortLabel = model.sortControl
		? getControlLabel(model.sortControl, model.sortBy)
		: (model.sortBy === 'recent' ? 'Recent' : model.sortBy === 'title' ? 'A-Z' : 'Added');
	const titleName = model.libraryName ?? 'Library';
	const listTitle = `${icons.library} ${titleName} (${model.items.length}) \u2500 ${sortLabel}`;

	if (model.loading) {
		const content = [loadingLine()];
		const panel = renderPanel(content, { title: listTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else if (model.error) {
		const content = [colors.error(model.error)];
		const panel = renderPanel(content, { title: listTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else if (model.items.length === 0) {
		const content = ['', colors.dim(' Your library is empty.'), colors.dim(' Browse sources to add titles.')];
		const panel = renderPanel(content, { title: listTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else {
		// Build list content
		const innerW = (narrow ? cols : layout.leftWidth) - 2;
		const listRows = (narrow ? rows - 1 : layout.panelHeight) - 2; // subtract borders
		const win = listWindow(model.items.length, model.selected, listRows);
		const listContent: string[] = [];

		for (const idx of win.visibleItems) {
			const item = model.items[idx];
			const selected = idx === model.selected;

			const unreadBadge = item.unreadCount > 0 ? colors.accent(` (${item.unreadCount})`) : '';
			const sourceBadge = colors.dim(`[${truncate(item.sourceId, 13)}]`);
			const statusTag = item.status ? ` ${selected ? colors.accent(item.status) : colors.dim(item.status)}` : '';
			const metaStr = `${unreadBadge} ${sourceBadge}${statusTag}`;
			const metaWidth = stripAnsi(metaStr).length;
			const titleWidth = innerW - 3 - metaWidth;
			const title = truncate(item.title, Math.max(1, titleWidth));

			const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
			const titleStr = selected ? colors.selected(title) : colors.snow(title);

			if (selected) {
				listContent.push(colors.selBg(padAnsi(`${prefix}${titleStr}${metaStr}`, innerW)));
			} else {
				listContent.push(`${prefix}${titleStr}${metaStr}`);
			}
		}

		const scrollInfo = model.items.length > listRows
			? { total: model.items.length, offset: win.start, visible: listRows }
			: undefined;

		if (narrow) {
			const panel = renderPanel(listContent, { title: listTitle, active: true, width: cols, height: rows - 1, scroll: scrollInfo });
			lines.push(...panel);
		} else {
			const leftPanel = renderPanel(listContent, {
				title: listTitle,
				active: true,
				width: layout.leftWidth,
				height: layout.panelHeight,
				scroll: scrollInfo,
			});

			const selectedItem = model.items[model.selected];
			const previewContent = workPreview(selectedItem ?? null, layout.rightWidth - 3);
			const rightPanel = renderPanel(previewContent, {
				title: `${icons.info} Preview`,
				active: false,
				width: layout.rightWidth,
				height: layout.panelHeight,
			});

			lines.push(...sideBySide(leftPanel, rightPanel));
		}
	}

	// Fill
	const usedRows = lines.length + 1;
	const remaining = rows - usedRows;
	for (let i = 0; i < remaining; i++) {
		lines.push('');
	}

	lines.push(statusBar([
		'\u2191\u2193 navigate',
		'Enter detail',
		's sort',
		'd remove',
		'q back',
	], cols));

	return lines.join('\n');
}

// ── Column Renderers ──

export type LibraryColumnAction =
	| { type: 'detail'; sourceId: string; workId: string; title: string }
	| { type: 'pass' }
	| null;

export function updateColumn(model: LibraryModel, key: KeyMsg): { model: LibraryModel; action: LibraryColumnAction; asyncFn?: () => Promise<LibraryModel> } {
	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selected: Math.min(model.selected + 1, Math.max(0, model.items.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selected: Math.max(model.selected - 1, 0) },
				action: null,
			};
		case 'enter':
		case 'l':
		case 'right': {
			const item = model.items[model.selected];
			if (!item) return { model, action: null };
			return { model, action: { type: 'detail', sourceId: item.sourceId, workId: item.workId, title: item.title } };
		}
		case 'd': {
			const item = model.items[model.selected];
			if (!item) return { model, action: null };
			const newModel = { ...model, loading: true };
			return {
				model: newModel,
				action: null,
				asyncFn: async () => {
					await api.removeFromLibrary(item.sourceId, item.workId);
					return loadScope(newModel);
				},
			};
		}
		case 's': {
			const next = model.sortControl
				? cycleControlValue(model.sortControl, model.sortBy)
				: (model.sortBy === 'recent' ? 'title' : model.sortBy === 'title' ? 'added' : 'recent');
			const newModel = { ...model, sortBy: next, loading: true };
			return {
				model: newModel,
				action: null,
				asyncFn: () => loadScope(newModel),
			};
		}
		default:
			return { model, action: { type: 'pass' } };
	}
}

/** Load data based on current scope (library or collection). */
export async function loadScope(model: LibraryModel): Promise<LibraryModel> {
	const scope = model.scopes[model.loadedScopeIndex];
	if (!scope || scope.kind === 'all') return load(model);
	if (scope.kind === 'collection') {
		try {
			const items = await api.getCollectionEnriched(scope.id, { sort: model.sortBy });
			// Group by libraryId, preserving first-seen order within each group
			const libOrder = new Map<string, number>();
			for (const item of items) {
				const key = item.libraryId ?? '';
				if (!libOrder.has(key)) libOrder.set(key, libOrder.size);
			}
			items.sort((a, b) => {
				const aOrder = libOrder.get(a.libraryId ?? '') ?? 0;
				const bOrder = libOrder.get(b.libraryId ?? '') ?? 0;
				return aOrder - bOrder;
			});
			return { ...model, items, loading: false, error: null };
		} catch (err) {
			return { ...model, loading: false, error: String(err) };
		}
	}
	return load(model);
}

/** Render library list as a single column panel, with preview stacked below. */
export function viewListColumn(model: LibraryModel, width: number, height: number, focused: boolean): string[] {
	const sortLabel = model.sortControl
		? getControlLabel(model.sortControl, model.sortBy)
		: (model.sortBy === 'recent' ? 'Recent' : model.sortBy === 'title' ? 'A-Z' : 'Added');

	const scope = model.scopes[model.loadedScopeIndex];
	const scopeLabel = scope ? scope.label : 'Library';
	const listTitle = `${icons.library} ${scopeLabel} (${model.items.length}) \u2500 ${sortLabel}`;

	const canStack = height >= 16;
	const previewHeight = canStack ? Math.max(8, Math.min(14, Math.floor(height * 0.3))) : 0;
	const listHeight = height - previewHeight;

	if (model.loading) {
		const listPanel = renderPanel([loadingLine()], { title: listTitle, active: focused, width, height: listHeight });
		if (!canStack) return listPanel;
		const previewPanel = renderPanel([], { title: `${icons.info} Preview`, active: false, width, height: previewHeight });
		return [...listPanel, ...previewPanel];
	}
	if (model.error) {
		const listPanel = renderPanel([colors.error(model.error)], { title: listTitle, active: focused, width, height: listHeight });
		if (!canStack) return listPanel;
		const previewPanel = renderPanel([], { title: `${icons.info} Preview`, active: false, width, height: previewHeight });
		return [...listPanel, ...previewPanel];
	}
	if (model.items.length === 0) {
		const listPanel = renderPanel(['', colors.dim(' Library is empty.'), colors.dim(' Browse sources to add.')], { title: listTitle, active: focused, width, height: listHeight });
		if (!canStack) return listPanel;
		const previewPanel = renderPanel([], { title: `${icons.info} Preview`, active: false, width, height: previewHeight });
		return [...listPanel, ...previewPanel];
	}

	const innerW = width - 2;
	const listRows = listHeight - 2;
	const content: string[] = [];
	let scrollInfo: { total: number; offset: number; visible: number } | undefined;

	const isCollection = scope?.kind === 'collection';

	if (isCollection) {
		// Build display list with group separators
		type DisplayItem = { type: 'item'; idx: number } | { type: 'group'; label: string };
		const display: DisplayItem[] = [];
		let lastLibId: string | undefined = '\0';
		for (let i = 0; i < model.items.length; i++) {
			const libId = model.items[i].libraryId ?? '';
			if (libId !== lastLibId) {
				const libScope = model.scopes.find(s => s.kind === 'library' && s.id === libId);
				display.push({ type: 'group', label: libScope?.label ?? 'Unsorted' });
				lastLibId = libId;
			}
			display.push({ type: 'item', idx: i });
		}

		const selectedDisplayIdx = display.findIndex(d => d.type === 'item' && d.idx === model.selected);
		const win = listWindow(display.length, Math.max(0, selectedDisplayIdx), listRows);

		for (const visIdx of win.visibleItems) {
			const d = display[visIdx];
			if (d.type === 'group') {
				const sepLen = Math.min(innerW - 1, d.label.length + 5);
				content.push(colors.dimmer(` \u2500\u2500 ${d.label} \u2500`.padEnd(sepLen, '\u2500')));
			} else {
				const item = model.items[d.idx];
				const selected = d.idx === model.selected;
				const unreadBadge = item.unreadCount > 0 ? colors.accent(` (${item.unreadCount})`) : '';
				const sourceBadge = colors.dim(`[${truncate(item.sourceId, 13)}]`);
				const metaStr = `${unreadBadge} ${sourceBadge}`;
				const metaWidth = stripAnsi(metaStr).length;
				const titleWidth = innerW - 3 - metaWidth;
				const title = truncate(item.title, Math.max(1, titleWidth));
				const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
				const titleStr = selected ? colors.selected(title) : colors.snow(title);

				if (selected) {
					content.push(colors.selBg(padAnsi(`${prefix}${titleStr}${metaStr}`, innerW)));
				} else {
					content.push(`${prefix}${titleStr}${metaStr}`);
				}
			}
		}

		if (display.length > listRows) {
			scrollInfo = { total: display.length, offset: win.start, visible: listRows };
		}
	} else {
		// Flat list
		const win = listWindow(model.items.length, model.selected, listRows);

		for (const idx of win.visibleItems) {
			const item = model.items[idx];
			const selected = idx === model.selected;
			const unreadBadge = item.unreadCount > 0 ? colors.accent(` (${item.unreadCount})`) : '';
			const sourceBadge = colors.dim(`[${truncate(item.sourceId, 13)}]`);
			const metaStr = `${unreadBadge} ${sourceBadge}`;
			const metaWidth = stripAnsi(metaStr).length;
			const titleWidth = innerW - 3 - metaWidth;
			const title = truncate(item.title, Math.max(1, titleWidth));
			const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
			const titleStr = selected ? colors.selected(title) : colors.snow(title);

			if (selected) {
				content.push(colors.selBg(padAnsi(`${prefix}${titleStr}${metaStr}`, innerW)));
			} else {
				content.push(`${prefix}${titleStr}${metaStr}`);
			}
		}

		if (model.items.length > listRows) {
			scrollInfo = { total: model.items.length, offset: win.start, visible: listRows };
		}
	}

	const listPanel = renderPanel(content, { title: listTitle, active: focused, width, height: listHeight, scroll: scrollInfo });

	if (!canStack) return listPanel;

	// List on top, preview on bottom
	const selectedItem = model.items[model.selected] ?? null;
	const previewContent = workPreview(selectedItem, width - 3);
	const previewPanel = renderPanel(previewContent, { title: `${icons.info} Preview`, active: false, width, height: previewHeight });
	return [...listPanel, ...previewPanel];
}

/** Render work preview as a standalone column panel (used by browse/search drill-down). */
export function viewPreviewColumn(model: LibraryModel, width: number, height: number, focused: boolean): string[] {
	const selectedItem = model.items[model.selected] ?? null;
	const content = workPreview(selectedItem, width - 3);
	return renderPanel(content, { title: `${icons.info} Preview`, active: focused, width, height });
}

// ── Scope Column ──

export type LibraryScopeColumnAction =
	| { type: 'scopeSelected' }
	| { type: 'pass' }
	| null;

export function updateScopeColumn(model: LibraryModel, key: KeyMsg): { model: LibraryModel; action: LibraryScopeColumnAction; asyncFn?: () => Promise<LibraryModel> } {
	switch (key.key) {
		case 'j':
		case 'down': {
			const next = Math.min(model.scopeIndex + 1, model.scopes.length - 1);
			if (next === model.scopeIndex) return { model, action: null };
			const scope = model.scopes[next];
			const newModel: LibraryModel = {
				...model,
				scopeIndex: next,
				loadedScopeIndex: next,
				libraryId: scope.kind === 'library' ? scope.id : undefined,
				libraryName: scope.kind === 'all' ? undefined : scope.label,
				selected: 0,
				loading: true,
			};
			return { model: newModel, action: null, asyncFn: () => loadScope(newModel) };
		}
		case 'k':
		case 'up': {
			const prev = Math.max(model.scopeIndex - 1, 0);
			if (prev === model.scopeIndex) return { model, action: null };
			const scope = model.scopes[prev];
			const newModel: LibraryModel = {
				...model,
				scopeIndex: prev,
				loadedScopeIndex: prev,
				libraryId: scope.kind === 'library' ? scope.id : undefined,
				libraryName: scope.kind === 'all' ? undefined : scope.label,
				selected: 0,
				loading: true,
			};
			return { model: newModel, action: null, asyncFn: () => loadScope(newModel) };
		}
		case 'enter':
		case 'l':
		case 'right':
			// Focus the list panel
			return { model, action: { type: 'pass' } };
		default:
			return { model, action: { type: 'pass' } };
	}
}

/** Render scope selector as a borderless sidebar. */
export function viewScopeColumn(model: LibraryModel, width: number, height: number, focused: boolean): string[] {
	const lines: string[] = [];

	// Build display items: selectable scopes with visual separators between kinds
	type DisplayItem = { type: 'scope'; idx: number } | { type: 'separator'; label: string };
	const display: DisplayItem[] = [];
	let lastKind = '';

	for (let i = 0; i < model.scopes.length; i++) {
		const scope = model.scopes[i];
		if (scope.kind !== lastKind && scope.kind !== 'all') {
			const label = scope.kind === 'library' ? 'Libraries' : 'Collections';
			display.push({ type: 'separator', label });
		}
		display.push({ type: 'scope', idx: i });
		lastKind = scope.kind;
	}

	// Map scopeIndex to display index for scrolling
	const scopeDisplayIdx = display.findIndex(d => d.type === 'scope' && d.idx === model.scopeIndex);
	const win = listWindow(display.length, Math.max(0, scopeDisplayIdx), height);

	// Scrollbar calculation
	const hasScrollbar = display.length > height;
	let thumbStart = 0;
	let thumbSize = 0;
	if (hasScrollbar) {
		thumbSize = Math.max(1, Math.round(height / display.length * height));
		const maxOffset = Math.max(1, display.length - height);
		thumbStart = Math.round(win.start / maxOffset * (height - thumbSize));
	}
	const contentW = hasScrollbar ? width - 1 : width;

	for (let lineIdx = 0; lineIdx < win.visibleItems.length; lineIdx++) {
		const visIdx = win.visibleItems[lineIdx];
		const item = display[visIdx];
		const scrollChar = hasScrollbar
			? (lineIdx >= thumbStart && lineIdx < thumbStart + thumbSize ? colors.accent('\u2590') : ' ')
			: '';

		if (item.type === 'separator') {
			const sepLen = Math.min(contentW - 2, item.label.length + 4);
			const sep = colors.dimmer(` \u2500 ${item.label} \u2500`.padEnd(sepLen, '\u2500'));
			lines.push(padAnsi(sep, contentW) + scrollChar);
		} else {
			const scope = model.scopes[item.idx];
			const selected = item.idx === model.scopeIndex;
			const loaded = item.idx === model.loadedScopeIndex;

			if (selected && focused) {
				const prefix = colors.accent(' \u25b8 ');
				const label = colors.selected(truncate(scope.label, contentW - 3));
				lines.push(colors.selBg(padAnsi(`${prefix}${label}`, contentW)) + scrollChar);
			} else if (selected) {
				const prefix = colors.dimmer(' \u25b8 ');
				const label = colors.snow(truncate(scope.label, contentW - 3));
				lines.push(padAnsi(`${prefix}${label}`, contentW) + scrollChar);
			} else if (loaded) {
				const prefix = colors.frost(' \u25cf ');
				const label = colors.snow(truncate(scope.label, contentW - 3));
				lines.push(padAnsi(`${prefix}${label}`, contentW) + scrollChar);
			} else {
				const label = colors.dim(truncate(scope.label, contentW - 3));
				lines.push(padAnsi(`   ${label}`, contentW) + scrollChar);
			}
		}
	}

	// Fill remaining area
	for (let i = lines.length; i < height; i++) {
		const scrollChar = hasScrollbar
			? (i >= thumbStart && i < thumbStart + thumbSize ? colors.accent('\u2590') : ' ')
			: '';
		lines.push(' '.repeat(contentW) + scrollChar);
	}

	return lines;
}
