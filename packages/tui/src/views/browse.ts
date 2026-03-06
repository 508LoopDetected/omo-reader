/**
 * Browse view — paginated work list from a source with preview panel.
 */

import * as api from '../api.js';
import type { WorkEntry } from '../api.js';
import { colors, statusBar, listWindow, truncate, loadingLine, stripAnsi } from '../ui.js';
import { renderPanel, sideBySide, computeSplitLayout, padAnsi, workPreview, icons } from '../layout.js';
import type { Msg, KeyMsg } from '../tea.js';

export interface BrowseModel {
	sourceId: string;
	sourceName: string;
	items: WorkEntry[];
	selected: number;
	page: number;
	mode: 'popular' | 'latest';
	hasNext: boolean;
	loading: boolean;
	error: string | null;
}

export function init(sourceId: string, sourceName: string): BrowseModel {
	return {
		sourceId,
		sourceName,
		items: [],
		selected: 0,
		page: 1,
		mode: 'popular',
		hasNext: false,
		loading: true,
		error: null,
	};
}

export async function load(model: BrowseModel): Promise<BrowseModel> {
	try {
		const result = await api.browseSource(model.sourceId, model.page, model.mode);
		return { ...model, items: result.items, hasNext: result.hasNextPage, loading: false, error: null };
	} catch (err) {
		return { ...model, loading: false, error: String(err) };
	}
}

export type BrowseAction =
	| { type: 'detail'; sourceId: string; workId: string; title: string }
	| { type: 'back' }
	| null;

export function update(model: BrowseModel, msg: Msg): { model: BrowseModel; action: BrowseAction; reload?: boolean } {
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
			return { model, action: { type: 'detail', sourceId: model.sourceId, workId: item.id, title: item.title } };
		}
		case 'n':
			if (model.hasNext) {
				return {
					model: { ...model, page: model.page + 1, selected: 0, loading: true },
					action: null,
					reload: true,
				};
			}
			return { model, action: null };
		case 'p':
			if (model.page > 1) {
				return {
					model: { ...model, page: model.page - 1, selected: 0, loading: true },
					action: null,
					reload: true,
				};
			}
			return { model, action: null };
		case 't':
			return {
				model: {
					...model,
					mode: model.mode === 'popular' ? 'latest' : 'popular',
					page: 1,
					selected: 0,
					loading: true,
				},
				action: null,
				reload: true,
			};
		case 'q':
		case 'escape':
			return { model, action: { type: 'back' } };
		default:
			return { model, action: null };
	}
}

export function view(model: BrowseModel, cols: number, rows: number): string {
	const lines: string[] = [];
	const narrow = cols < 60;
	const modeLabel = model.mode.charAt(0).toUpperCase() + model.mode.slice(1);
	const listTitle = `${icons.browse} ${model.sourceName} \u00b7 ${modeLabel} \u2500 pg ${model.page}`;

	const layout = computeSplitLayout(cols, rows, 0.45, 0, 1);

	if (model.loading) {
		const content = [loadingLine()];
		const panel = renderPanel(content, { title: listTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else if (model.error) {
		const content = [colors.error(model.error)];
		const panel = renderPanel(content, { title: listTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else if (model.items.length === 0) {
		const content = ['', colors.dim(' No results.')];
		const panel = renderPanel(content, { title: listTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else {
		const innerW = (narrow ? cols : layout.leftWidth) - 2;
		const listRows = (narrow ? rows - 1 : layout.panelHeight) - 2;
		const win = listWindow(model.items.length, model.selected, listRows);
		const listContent: string[] = [];

		for (const idx of win.visibleItems) {
			const item = model.items[idx];
			const selected = idx === model.selected;

			const statusBadge = item.status ? ` ${colors.dim(`[${item.status}]`)}` : '';
			const statusLen = item.status ? item.status.length + 3 : 0;
			const titleWidth = Math.max(1, innerW - 3 - statusLen);
			const title = truncate(item.title, titleWidth);

			const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
			const titleStr = selected ? colors.selected(title) : colors.snow(title);

			if (selected) {
				listContent.push(colors.selBg(padAnsi(`${prefix}${titleStr}${statusBadge}`, innerW)));
			} else {
				listContent.push(`${prefix}${titleStr}${statusBadge}`);
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
		'n/p page',
		't mode',
		'q back',
	], cols));

	return lines.join('\n');
}

// ── Column Renderers ──

export type BrowseColumnAction =
	| { type: 'detail'; sourceId: string; workId: string; title: string }
	| { type: 'pass' }
	| null;

export function updateColumn(model: BrowseModel, key: KeyMsg): { model: BrowseModel; action: BrowseColumnAction; reload?: boolean } {
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
			return { model, action: { type: 'detail', sourceId: model.sourceId, workId: item.id, title: item.title } };
		}
		case 'n':
			if (model.hasNext) {
				return {
					model: { ...model, page: model.page + 1, selected: 0, loading: true },
					action: null,
					reload: true,
				};
			}
			return { model, action: null };
		case 'p':
			if (model.page > 1) {
				return {
					model: { ...model, page: model.page - 1, selected: 0, loading: true },
					action: null,
					reload: true,
				};
			}
			return { model, action: null };
		case 't':
			return {
				model: {
					...model,
					mode: model.mode === 'popular' ? 'latest' : 'popular',
					page: 1,
					selected: 0,
					loading: true,
				},
				action: null,
				reload: true,
			};
		default:
			return { model, action: { type: 'pass' } };
	}
}

/** Render browse list as a single column panel. */
export function viewListColumn(model: BrowseModel, width: number, height: number, focused: boolean): string[] {
	const modeLabel = model.mode.charAt(0).toUpperCase() + model.mode.slice(1);
	const listTitle = `${icons.browse} ${model.sourceName} \u00b7 ${modeLabel} \u2500 pg ${model.page}`;

	if (model.loading) {
		return renderPanel([loadingLine()], { title: listTitle, active: focused, width, height });
	}
	if (model.error) {
		return renderPanel([colors.error(model.error)], { title: listTitle, active: focused, width, height });
	}
	if (model.items.length === 0) {
		return renderPanel(['', colors.dim(' No results.')], { title: listTitle, active: focused, width, height });
	}

	const innerW = width - 2;
	const listRows = height - 2;
	const win = listWindow(model.items.length, model.selected, listRows);
	const content: string[] = [];

	for (const idx of win.visibleItems) {
		const item = model.items[idx];
		const selected = idx === model.selected;
		const statusBadge = item.status ? ` ${colors.dim(`[${item.status}]`)}` : '';
		const statusLen = item.status ? item.status.length + 3 : 0;
		const titleWidth = Math.max(1, innerW - 3 - statusLen);
		const title = truncate(item.title, titleWidth);
		const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
		const titleStr = selected ? colors.selected(title) : colors.snow(title);

		if (selected) {
			content.push(colors.selBg(padAnsi(`${prefix}${titleStr}${statusBadge}`, innerW)));
		} else {
			content.push(`${prefix}${titleStr}${statusBadge}`);
		}
	}

	const scrollInfo = model.items.length > listRows
		? { total: model.items.length, offset: win.start, visible: listRows }
		: undefined;

	return renderPanel(content, { title: listTitle, active: focused, width, height, scroll: scrollInfo });
}

/** Render browse preview as a single column panel. */
export function viewPreviewColumn(model: BrowseModel, width: number, height: number, focused: boolean): string[] {
	const selectedItem = model.items[model.selected] ?? null;
	const content = workPreview(selectedItem, width - 3);
	return renderPanel(content, { title: `${icons.info} Preview`, active: focused, width, height });
}
