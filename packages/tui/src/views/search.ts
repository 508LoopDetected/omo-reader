/**
 * Search view — multi-source search with text input above split panels.
 */

import * as api from '../api.js';
import type { Source, WorkEntry } from '../api.js';
import { colors, statusBar, listWindow, truncate, loadingLine, stripAnsi } from '../ui.js';
import { renderPanel, sideBySide, computeSplitLayout, padAnsi, workPreview, icons } from '../layout.js';
import type { Msg, KeyMsg } from '../tea.js';

interface SourceResult {
	source: Source;
	items: WorkEntry[];
	hasNextPage: boolean;
}

export interface SearchModel {
	query: string;
	cursorPos: number;
	results: SourceResult[];
	// Flat list of all result items for navigation
	flatItems: Array<{ sourceIdx: number; itemIdx: number; item: WorkEntry; source: Source }>;
	selectedFlat: number;
	loading: boolean;
	error: string | null;
	inputFocused: boolean;
	hasSearched: boolean;
}

export function init(): SearchModel {
	return {
		query: '',
		cursorPos: 0,
		results: [],
		flatItems: [],
		selectedFlat: 0,
		loading: false,
		error: null,
		inputFocused: false,
		hasSearched: false,
	};
}

function buildFlatList(results: SourceResult[]): SearchModel['flatItems'] {
	const flat: SearchModel['flatItems'] = [];
	for (let si = 0; si < results.length; si++) {
		const sr = results[si];
		for (let ii = 0; ii < sr.items.length; ii++) {
			flat.push({ sourceIdx: si, itemIdx: ii, item: sr.items[ii], source: sr.source });
		}
	}
	return flat;
}

export async function doSearch(model: SearchModel): Promise<SearchModel> {
	if (!model.query.trim()) return model;
	try {
		const data = await api.searchAll(model.query.trim());
		const results = data.results;
		const flatItems = buildFlatList(results);
		return {
			...model,
			results,
			flatItems,
			selectedFlat: 0,
			loading: false,
			error: null,
			inputFocused: false,
			hasSearched: true,
		};
	} catch (err) {
		return { ...model, loading: false, error: String(err), hasSearched: true };
	}
}

export type SearchAction =
	| { type: 'detail'; sourceId: string; workId: string; title: string }
	| { type: 'back' }
	| null;

export function update(model: SearchModel, msg: Msg): { model: SearchModel; action: SearchAction; doSearch?: boolean } {
	if (msg.type !== 'key') return { model, action: null };
	const key = msg as KeyMsg;

	// Input mode
	if (model.inputFocused) {
		switch (key.key) {
			case 'enter':
				if (model.query.trim()) {
					return { model: { ...model, loading: true }, action: null, doSearch: true };
				}
				return { model, action: null };
			case 'escape':
			case 'tab':
				return { model: { ...model, inputFocused: false }, action: null };
			case 'backspace':
				if (model.cursorPos > 0) {
					const newQuery = model.query.slice(0, model.cursorPos - 1) + model.query.slice(model.cursorPos);
					return { model: { ...model, query: newQuery, cursorPos: model.cursorPos - 1 }, action: null };
				}
				return { model, action: null };
			case 'left':
				return { model: { ...model, cursorPos: Math.max(0, model.cursorPos - 1) }, action: null };
			case 'right':
				return { model: { ...model, cursorPos: Math.min(model.query.length, model.cursorPos + 1) }, action: null };
			default:
				// Only accept printable characters
				if (key.key.length === 1 && !key.ctrl && key.key.charCodeAt(0) >= 32) {
					const newQuery = model.query.slice(0, model.cursorPos) + key.key + model.query.slice(model.cursorPos);
					return { model: { ...model, query: newQuery, cursorPos: model.cursorPos + 1 }, action: null };
				}
				return { model, action: null };
		}
	}

	// Results mode
	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selectedFlat: Math.min(model.selectedFlat + 1, Math.max(0, model.flatItems.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selectedFlat: Math.max(model.selectedFlat - 1, 0) },
				action: null,
			};
		case 'enter': {
			const flat = model.flatItems[model.selectedFlat];
			if (!flat) return { model, action: null };
			return {
				model,
				action: { type: 'detail', sourceId: flat.source.id, workId: flat.item.id, title: flat.item.title },
			};
		}
		case 'tab':
		case '/':
			return { model: { ...model, inputFocused: true }, action: null };
		case 'q':
		case 'escape':
			return { model, action: { type: 'back' } };
		default:
			return { model, action: null };
	}
}

export function view(model: SearchModel, cols: number, rows: number): string {
	const lines: string[] = [];
	const narrow = cols < 60;

	// Search input header (always full-width, outside panels)
	const inputLabel = colors.dim(` ${icons.search} Search `);
	const labelLen = stripAnsi(inputLabel).length;
	const sepBefore = colors.dimmer('\u2500\u2500');
	const sepAfter = colors.dimmer('\u2500'.repeat(Math.max(0, cols - labelLen - 2)));
	lines.push(sepBefore + inputLabel + sepAfter);

	const inputPrefix = model.inputFocused ? colors.accent(' \u25b8 ') : '   ';
	if (model.query.length > 0) {
		const cursor = model.inputFocused ? colors.accent('\u2588') : '';
		lines.push(`${inputPrefix}${colors.snow(model.query.slice(0, model.cursorPos))}${cursor}${colors.snow(model.query.slice(model.cursorPos))}`);
	} else {
		lines.push(`${inputPrefix}${model.inputFocused ? colors.accent('\u2588') : colors.dim('Type to search...')}`);
	}
	lines.push('');

	const headerRows = 3; // input header lines above panels
	const layout = computeSplitLayout(cols, rows, 0.45, headerRows, 1);

	if (model.loading) {
		const content = [loadingLine('Searching...')];
		const panel = renderPanel(content, { title: `${icons.search} Results`, active: true, width: cols, height: layout.panelHeight });
		lines.push(...panel);
	} else if (model.error) {
		const content = [colors.error(model.error)];
		const panel = renderPanel(content, { title: `${icons.search} Results`, active: true, width: cols, height: layout.panelHeight });
		lines.push(...panel);
	} else if (model.hasSearched && model.results.length === 0) {
		const content = ['', colors.dim(' No results found.')];
		const panel = renderPanel(content, { title: `${icons.search} Results`, active: true, width: cols, height: layout.panelHeight });
		lines.push(...panel);
	} else if (model.hasSearched) {
		const innerW = (narrow ? cols : layout.leftWidth) - 2;
		const listRows = layout.panelHeight - 2;
		const win = listWindow(model.flatItems.length, model.selectedFlat, listRows);
		const listContent: string[] = [];

		let lastSourceIdx = -1;
		for (const visIdx of win.visibleItems) {
			const flat = model.flatItems[visIdx];
			// Source header when source changes
			if (flat.sourceIdx !== lastSourceIdx) {
				if (lastSourceIdx !== -1) listContent.push('');
				const sr = model.results[flat.sourceIdx];
				listContent.push(` ${colors.teal(sr.source.name)} ${colors.dim(`\u00b7 ${sr.items.length} results`)}`);
				lastSourceIdx = flat.sourceIdx;
			}

			const selected = visIdx === model.selectedFlat && !model.inputFocused;
			const statusBadge = flat.item.status ? ` ${colors.dim(`[${flat.item.status}]`)}` : '';
			const statusLen = flat.item.status ? flat.item.status.length + 3 : 0;
			const titleWidth = Math.max(1, innerW - 5 - statusLen);
			const title = truncate(flat.item.title, titleWidth);

			const prefix = selected ? colors.accent('   \u25b8 ') : '     ';
			const titleStr = selected ? colors.selected(title) : colors.snow(title);

			if (selected) {
				listContent.push(colors.selBg(padAnsi(`${prefix}${titleStr}${statusBadge}`, innerW)));
			} else {
				listContent.push(`${prefix}${titleStr}${statusBadge}`);
			}
		}

		const scrollInfo = model.flatItems.length > listRows
			? { total: model.flatItems.length, offset: win.start, visible: listRows }
			: undefined;

		if (narrow) {
			const panel = renderPanel(listContent, { title: `${icons.search} Results`, active: !model.inputFocused, width: cols, height: layout.panelHeight, scroll: scrollInfo });
			lines.push(...panel);
		} else {
			const leftPanel = renderPanel(listContent, {
				title: `${icons.search} Results`,
				active: !model.inputFocused,
				width: layout.leftWidth,
				height: layout.panelHeight,
				scroll: scrollInfo,
			});

			const selectedFlat = model.flatItems[model.selectedFlat];
			const previewContent = workPreview(selectedFlat?.item ?? null, layout.rightWidth - 3);
			const rightPanel = renderPanel(previewContent, {
				title: `${icons.info} Preview`,
				active: false,
				width: layout.rightWidth,
				height: layout.panelHeight,
			});

			lines.push(...sideBySide(leftPanel, rightPanel));
		}
	} else {
		// No search yet — show empty panel
		const content = ['', colors.dim(' Type a query and press Enter.')];
		const panel = renderPanel(content, { title: `${icons.search} Results`, active: false, width: cols, height: layout.panelHeight });
		lines.push(...panel);
	}

	// Fill
	const usedRows = lines.length + 1;
	const remaining = rows - usedRows;
	for (let i = 0; i < remaining; i++) {
		lines.push('');
	}

	lines.push(statusBar(
		model.inputFocused
			? ['Enter search', 'Tab results', 'Esc back']
			: ['\u2191\u2193 navigate', 'Enter detail', 'Tab/\u002f input', 'q back'],
		cols,
	));

	return lines.join('\n');
}

// ── Column Renderers ──

export type SearchColumnAction =
	| { type: 'detail'; sourceId: string; workId: string; title: string }
	| { type: 'pass' }
	| null;

export function updateColumn(model: SearchModel, key: KeyMsg): { model: SearchModel; action: SearchColumnAction; doSearch?: boolean } {
	// Input mode
	if (model.inputFocused) {
		switch (key.key) {
			case 'enter':
				if (model.query.trim()) {
					return { model: { ...model, loading: true }, action: null, doSearch: true };
				}
				return { model, action: null };
			case 'escape':
			case 'tab':
				return { model: { ...model, inputFocused: false }, action: null };
			case 'backspace':
				if (model.cursorPos > 0) {
					const newQuery = model.query.slice(0, model.cursorPos - 1) + model.query.slice(model.cursorPos);
					return { model: { ...model, query: newQuery, cursorPos: model.cursorPos - 1 }, action: null };
				}
				return { model, action: null };
			case 'left':
				return { model: { ...model, cursorPos: Math.max(0, model.cursorPos - 1) }, action: null };
			case 'right':
				return { model: { ...model, cursorPos: Math.min(model.query.length, model.cursorPos + 1) }, action: null };
			default:
				if (key.key.length === 1 && !key.ctrl && key.key.charCodeAt(0) >= 32) {
					const newQuery = model.query.slice(0, model.cursorPos) + key.key + model.query.slice(model.cursorPos);
					return { model: { ...model, query: newQuery, cursorPos: model.cursorPos + 1 }, action: null };
				}
				return { model, action: null };
		}
	}

	// Results mode
	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selectedFlat: Math.min(model.selectedFlat + 1, Math.max(0, model.flatItems.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selectedFlat: Math.max(model.selectedFlat - 1, 0) },
				action: null,
			};
		case 'enter':
		case 'l':
		case 'right': {
			const flat = model.flatItems[model.selectedFlat];
			if (!flat) return { model, action: null };
			return {
				model,
				action: { type: 'detail', sourceId: flat.source.id, workId: flat.item.id, title: flat.item.title },
			};
		}
		case 'tab':
		case '/':
			return { model: { ...model, inputFocused: true }, action: null };
		default:
			return { model, action: { type: 'pass' } };
	}
}

/** Render search results (input + list) as a single column panel. */
export function viewResultsColumn(model: SearchModel, width: number, height: number, focused: boolean): string[] {
	const innerW = width - 2;
	const content: string[] = [];

	// Search input
	const inputLabel = colors.dim(` ${icons.search} `);
	const inputPrefix = model.inputFocused ? colors.accent('\u25b8 ') : '  ';
	if (model.query.length > 0) {
		const cursor = model.inputFocused ? colors.accent('\u2588') : '';
		content.push(`${inputPrefix}${inputLabel}${colors.snow(model.query.slice(0, model.cursorPos))}${cursor}${colors.snow(model.query.slice(model.cursorPos))}`);
	} else {
		content.push(`${inputPrefix}${inputLabel}${model.inputFocused ? colors.accent('\u2588') : colors.dim('Type to search...')}`);
	}
	content.push('');

	if (model.loading) {
		content.push(loadingLine('Searching...'));
	} else if (model.error) {
		content.push(colors.error(model.error));
	} else if (model.hasSearched && model.results.length === 0) {
		content.push(colors.dim(' No results found.'));
	} else if (model.hasSearched) {
		const listRows = height - 4; // borders + input rows
		const win = listWindow(model.flatItems.length, model.selectedFlat, listRows);

		let lastSourceIdx = -1;
		for (const visIdx of win.visibleItems) {
			const flat = model.flatItems[visIdx];
			if (flat.sourceIdx !== lastSourceIdx) {
				if (lastSourceIdx !== -1) content.push('');
				const sr = model.results[flat.sourceIdx];
				content.push(` ${colors.teal(sr.source.name)} ${colors.dim(`\u00b7 ${sr.items.length}`)}`);
				lastSourceIdx = flat.sourceIdx;
			}

			const selected = visIdx === model.selectedFlat && !model.inputFocused;
			const statusBadge = flat.item.status ? ` ${colors.dim(`[${flat.item.status}]`)}` : '';
			const statusLen = flat.item.status ? flat.item.status.length + 3 : 0;
			const titleWidth = Math.max(1, innerW - 5 - statusLen);
			const title = truncate(flat.item.title, titleWidth);
			const prefix = selected ? colors.accent('   \u25b8 ') : '     ';
			const titleStr = selected ? colors.selected(title) : colors.snow(title);

			if (selected) {
				content.push(colors.selBg(padAnsi(`${prefix}${titleStr}${statusBadge}`, innerW)));
			} else {
				content.push(`${prefix}${titleStr}${statusBadge}`);
			}
		}
	} else {
		content.push(colors.dim(' Type a query and press Enter.'));
	}

	return renderPanel(content, { title: `${icons.search} Search`, active: focused, width, height });
}

/** Render search preview as a single column panel. */
export function viewPreviewColumn(model: SearchModel, width: number, height: number, focused: boolean): string[] {
	const selectedFlat = model.flatItems[model.selectedFlat];
	const content = workPreview(selectedFlat?.item ?? null, width - 3);
	return renderPanel(content, { title: `${icons.info} Preview`, active: focused, width, height });
}
