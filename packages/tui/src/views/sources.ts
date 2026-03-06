/**
 * Sources view — list available sources with info panel.
 */

import * as api from '../api.js';
import type { Source } from '../api.js';
import { colors, statusBar, listWindow, truncate, pad, loadingLine, stripAnsi } from '../ui.js';
import { renderPanel, sideBySide, computeSplitLayout, padAnsi, sourceInfo, icons } from '../layout.js';
import type { Msg, KeyMsg } from '../tea.js';

export interface SourcesModel {
	sources: Source[];
	selected: number;
	loading: boolean;
	error: string | null;
}

export function init(): SourcesModel {
	return { sources: [], selected: 0, loading: true, error: null };
}

export async function load(model: SourcesModel): Promise<SourcesModel> {
	try {
		const sources = await api.getSources();
		return { ...model, sources, loading: false, error: null };
	} catch (err) {
		return { ...model, loading: false, error: String(err) };
	}
}

export type SourcesAction =
	| { type: 'browse'; sourceId: string; sourceName: string }
	| { type: 'back' }
	| null;

export function update(model: SourcesModel, msg: Msg): { model: SourcesModel; action: SourcesAction } {
	if (msg.type !== 'key') return { model, action: null };
	const key = msg as KeyMsg;

	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selected: Math.min(model.selected + 1, Math.max(0, model.sources.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selected: Math.max(model.selected - 1, 0) },
				action: null,
			};
		case 'enter': {
			const src = model.sources[model.selected];
			if (!src) return { model, action: null };
			return { model, action: { type: 'browse', sourceId: src.id, sourceName: src.name } };
		}
		case 'q':
		case 'escape':
			return { model, action: { type: 'back' } };
		default:
			return { model, action: null };
	}
}

function sourceTypeIcon(type: string): string {
	switch (type) {
		case 'native': return icons.star;
		case 'local': return icons.folder;
		case 'smb': return icons.network;
		case 'manga': return icons.manga;
		case 'western': return icons.western;
		case 'webcomic': return icons.webcomic;
		default: return icons.puzzle;
	}
}

export function view(model: SourcesModel, cols: number, rows: number): string {
	const lines: string[] = [];
	const narrow = cols < 60;

	const layout = computeSplitLayout(cols, rows, 0.45, 0, 1);
	const listTitle = `${icons.sources} Sources (${model.sources.length})`;

	if (model.loading) {
		const content = [loadingLine()];
		const panel = renderPanel(content, { title: listTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else if (model.error) {
		const content = [colors.error(model.error)];
		const panel = renderPanel(content, { title: listTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else if (model.sources.length === 0) {
		const content = ['', colors.dim(' No sources available.')];
		const panel = renderPanel(content, { title: listTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else {
		const innerW = (narrow ? cols : layout.leftWidth) - 2;
		const listRows = (narrow ? rows - 1 : layout.panelHeight) - 2;
		const win = listWindow(model.sources.length, model.selected, listRows);
		const listContent: string[] = [];

		for (const idx of win.visibleItems) {
			const src = model.sources[idx];
			const selected = idx === model.selected;

			const typeIcon = selected ? colors.accent(sourceTypeIcon(src.type)) : colors.dim(sourceTypeIcon(src.type));
			const langTag = colors.frost(src.lang);
			const metaStr = ` ${typeIcon} ${langTag}`;
			const metaWidth = stripAnsi(metaStr).length;
			const nameWidth = Math.max(1, innerW - 3 - metaWidth);
			const name = truncate(src.name, nameWidth);

			const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
			const nameStr = selected ? colors.selected(pad(name, nameWidth)) : colors.snow(pad(name, nameWidth));

			if (selected) {
				listContent.push(colors.selBg(padAnsi(`${prefix}${nameStr}${metaStr}`, innerW)));
			} else {
				listContent.push(`${prefix}${nameStr}${metaStr}`);
			}
		}

		const scrollInfo = model.sources.length > listRows
			? { total: model.sources.length, offset: win.start, visible: listRows }
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

			const selectedSource = model.sources[model.selected];
			const infoContent = sourceInfo(selectedSource ?? null, layout.rightWidth - 3);
			const rightPanel = renderPanel(infoContent, {
				title: `${icons.info} Info`,
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
		'Enter browse',
		'q back',
	], cols));

	return lines.join('\n');
}

// ── Column Renderers ──

export type SourcesColumnAction =
	| { type: 'browse'; sourceId: string; sourceName: string }
	| { type: 'pass' }
	| null;

export function updateColumn(model: SourcesModel, key: KeyMsg): { model: SourcesModel; action: SourcesColumnAction } {
	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selected: Math.min(model.selected + 1, Math.max(0, model.sources.length - 1)) },
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
			const src = model.sources[model.selected];
			if (!src) return { model, action: null };
			return { model, action: { type: 'browse', sourceId: src.id, sourceName: src.name } };
		}
		default:
			return { model, action: { type: 'pass' } };
	}
}

/** Render source list as a single column panel. */
export function viewListColumn(model: SourcesModel, width: number, height: number, focused: boolean): string[] {
	const listTitle = `${icons.sources} Sources (${model.sources.length})`;

	if (model.loading) {
		return renderPanel([loadingLine()], { title: listTitle, active: focused, width, height });
	}
	if (model.error) {
		return renderPanel([colors.error(model.error)], { title: listTitle, active: focused, width, height });
	}
	if (model.sources.length === 0) {
		return renderPanel(['', colors.dim(' No sources available.')], { title: listTitle, active: focused, width, height });
	}

	const innerW = width - 2;
	const listRows = height - 2;
	const win = listWindow(model.sources.length, model.selected, listRows);
	const content: string[] = [];

	for (const idx of win.visibleItems) {
		const src = model.sources[idx];
		const selected = idx === model.selected;
		const typeIcon = selected ? colors.accent(sourceTypeIcon(src.type)) : colors.dim(sourceTypeIcon(src.type));
		const langTag = colors.frost(src.lang);
		const metaStr = ` ${typeIcon} ${langTag}`;
		const metaWidth = stripAnsi(metaStr).length;
		const nameWidth = Math.max(1, innerW - 3 - metaWidth);
		const name = truncate(src.name, nameWidth);
		const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
		const nameStr = selected ? colors.selected(pad(name, nameWidth)) : colors.snow(pad(name, nameWidth));

		if (selected) {
			content.push(colors.selBg(padAnsi(`${prefix}${nameStr}${metaStr}`, innerW)));
		} else {
			content.push(`${prefix}${nameStr}${metaStr}`);
		}
	}

	const scrollInfo = model.sources.length > listRows
		? { total: model.sources.length, offset: win.start, visible: listRows }
		: undefined;

	return renderPanel(content, { title: listTitle, active: focused, width, height, scroll: scrollInfo });
}

/** Render source info as a single column panel. */
export function viewInfoColumn(model: SourcesModel, width: number, height: number, focused: boolean): string[] {
	const selectedSource = model.sources[model.selected] ?? null;
	const content = sourceInfo(selectedSource, width - 3);
	return renderPanel(content, { title: `${icons.info} Info`, active: focused, width, height });
}
