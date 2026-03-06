/**
 * Extensions view — install/uninstall extensions with search and language filter.
 */

import * as api from '../api.js';
import type { AvailableExtension } from '../api.js';
import { colors, statusBar, listWindow, truncate, stripAnsi } from '../ui.js';
import { renderPanel, padAnsi, icons } from '../layout.js';
import type { Msg, KeyMsg } from '../tea.js';

export interface ExtensionsModel {
	all: AvailableExtension[];
	filtered: AvailableExtension[];
	selected: number;
	loading: boolean;
	installing: string | null; // id being installed/uninstalled
	error: string | null;
	query: string;
	cursorPos: number;
	inputFocused: boolean;
	langFilter: string; // '' = all, or language code
	languages: string[];
}

export function init(): ExtensionsModel {
	return {
		all: [],
		filtered: [],
		selected: 0,
		loading: true,
		installing: null,
		error: null,
		query: '',
		cursorPos: 0,
		inputFocused: false,
		langFilter: '',
		languages: [],
	};
}

export async function load(model: ExtensionsModel): Promise<ExtensionsModel> {
	try {
		const all = await api.getExtensions();
		const languages = [...new Set(all.map(e => e.lang))].sort();
		const filtered = filterExtensions(all, model.query, model.langFilter);
		return { ...model, all, filtered, languages, loading: false, error: null };
	} catch (err) {
		return { ...model, loading: false, error: String(err) };
	}
}

function filterExtensions(all: AvailableExtension[], query: string, lang: string): AvailableExtension[] {
	let result = all;
	if (lang) {
		result = result.filter(e => e.lang === lang);
	}
	if (query) {
		const q = query.toLowerCase();
		result = result.filter(e => e.name.toLowerCase().includes(q));
	}
	// Sort: installed first, then alphabetical
	return result.sort((a, b) => {
		if (a.installed !== b.installed) return a.installed ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
}

export type ExtensionsAction =
	| { type: 'back' }
	| null;

export function update(model: ExtensionsModel, msg: Msg): { model: ExtensionsModel; action: ExtensionsAction; asyncFn?: () => Promise<ExtensionsModel> } {
	if (msg.type !== 'key') return { model, action: null };
	const key = msg as KeyMsg;

	if (model.inputFocused) {
		return updateInput(model, key);
	}

	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selected: Math.min(model.selected + 1, Math.max(0, model.filtered.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selected: Math.max(model.selected - 1, 0) },
				action: null,
			};
		case 'enter': {
			const ext = model.filtered[model.selected];
			if (!ext || model.installing) return { model, action: null };

			return {
				model: { ...model, installing: ext.id },
				action: null,
				asyncFn: async () => {
					try {
						if (ext.installed) {
							await api.uninstallExtension(ext.id);
						} else {
							await api.installExtension(ext);
						}
						return load({ ...model, installing: null });
					} catch {
						return { ...model, installing: null, error: `Failed to ${ext.installed ? 'uninstall' : 'install'} ${ext.name}` };
					}
				},
			};
		}
		case '/':
			return {
				model: { ...model, inputFocused: true, cursorPos: model.query.length },
				action: null,
			};
		case 'l': {
			// Cycle language filter
			const langs = ['', ...model.languages];
			const idx = langs.indexOf(model.langFilter);
			const next = langs[(idx + 1) % langs.length];
			const filtered = filterExtensions(model.all, model.query, next);
			return {
				model: { ...model, langFilter: next, filtered, selected: 0 },
				action: null,
			};
		}
		case 'q':
		case 'escape':
			return { model, action: { type: 'back' } };
		default:
			return { model, action: null };
	}
}

function updateInput(model: ExtensionsModel, key: KeyMsg): { model: ExtensionsModel; action: ExtensionsAction; asyncFn?: () => Promise<ExtensionsModel> } {
	switch (key.key) {
		case 'escape':
		case 'enter':
			return {
				model: { ...model, inputFocused: false },
				action: null,
			};
		case 'backspace': {
			if (model.cursorPos > 0) {
				const q = model.query.slice(0, model.cursorPos - 1) + model.query.slice(model.cursorPos);
				const filtered = filterExtensions(model.all, q, model.langFilter);
				return {
					model: { ...model, query: q, cursorPos: model.cursorPos - 1, filtered, selected: 0 },
					action: null,
				};
			}
			return { model, action: null };
		}
		case 'left':
			return { model: { ...model, cursorPos: Math.max(0, model.cursorPos - 1) }, action: null };
		case 'right':
			return { model: { ...model, cursorPos: Math.min(model.query.length, model.cursorPos + 1) }, action: null };
		default: {
			if (key.raw && key.raw.length === 1 && key.raw >= ' ') {
				const q = model.query.slice(0, model.cursorPos) + key.raw + model.query.slice(model.cursorPos);
				const filtered = filterExtensions(model.all, q, model.langFilter);
				return {
					model: { ...model, query: q, cursorPos: model.cursorPos + 1, filtered, selected: 0 },
					action: null,
				};
			}
			return { model, action: null };
		}
	}
}

export function view(model: ExtensionsModel, cols: number, rows: number): string {
	const lines: string[] = [];
	const langLabel = model.langFilter || 'all';
	const panelTitle = `${icons.puzzle} Extensions (${model.filtered.length}) \u2500 lang:${langLabel}`;

	if (model.loading) {
		const content = [colors.dim(' Loading extensions...')];
		const panel = renderPanel(content, { title: panelTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else if (model.error) {
		const content = [colors.error(model.error)];
		const panel = renderPanel(content, { title: panelTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else {
		const panelH = rows - 1;
		const innerW = cols - 2;

		// Search input row
		const searchPrefix = model.inputFocused ? colors.accent(' / ') : colors.dim(' / ');
		let searchContent: string;
		if (model.inputFocused) {
			const before = model.query.slice(0, model.cursorPos);
			const cursor = model.query[model.cursorPos] ?? ' ';
			const after = model.query.slice(model.cursorPos + 1);
			searchContent = `${searchPrefix}${colors.snow(before)}${colors.selBg(colors.accent(cursor))}${colors.snow(after)}`;
		} else if (model.query) {
			searchContent = `${searchPrefix}${colors.snow(model.query)}`;
		} else {
			searchContent = `${searchPrefix}${colors.dim('search...')}`;
		}

		const contentLines: string[] = [searchContent, ''];

		// Extension list
		const listRows = panelH - 4; // borders + search row + separator
		const win = listWindow(model.filtered.length, model.selected, listRows);

		let lastInstalled: boolean | null = null;
		for (const idx of win.visibleItems) {
			const ext = model.filtered[idx];
			const selected = idx === model.selected;

			// Section separator
			if (lastInstalled !== null && lastInstalled !== ext.installed) {
				contentLines.push(colors.dimmer(' ' + '\u2500'.repeat(Math.min(innerW - 2, 30))));
			}
			lastInstalled = ext.installed;

			const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
			const statusIcon = ext.installed ? colors.success('\u2713') : colors.dim('\u25cb');
			const installing = model.installing === ext.id;
			const nsfwTag = ext.isNsfw ? colors.error(' [18+]') : '';
			const langTag = colors.dim(` [${ext.lang}]`);

			const nameWidth = Math.max(1, innerW - 15);
			const name = truncate(ext.name, nameWidth);
			const nameStr = selected ? colors.selected(name) : (ext.installed ? colors.snow(name) : colors.dim(name));

			let line: string;
			if (installing) {
				line = `${prefix}${colors.warning('\u25cf')} ${nameStr}${langTag}${nsfwTag} ${colors.warning('...')}`;
			} else {
				line = `${prefix}${statusIcon} ${nameStr}${langTag}${nsfwTag}`;
			}

			if (selected) {
				contentLines.push(colors.selBg(padAnsi(line, innerW)));
			} else {
				contentLines.push(line);
			}
		}

		const scrollInfo = model.filtered.length > listRows
			? { total: model.filtered.length, offset: win.start, visible: listRows }
			: undefined;

		const panel = renderPanel(contentLines, {
			title: panelTitle,
			active: true,
			width: cols,
			height: panelH,
			scroll: scrollInfo,
		});
		lines.push(...panel);
	}

	// Fill
	const usedRows = lines.length + 1;
	const remaining = rows - usedRows;
	for (let i = 0; i < remaining; i++) {
		lines.push('');
	}

	lines.push(statusBar([
		'\u2191\u2193 navigate',
		'Enter install/remove',
		'/ search',
		'l language',
		'q back',
	], cols));

	return lines.join('\n');
}

// ── Column Renderers ──

export type ExtensionsColumnAction =
	| { type: 'pass' }
	| null;

export function updateColumn(model: ExtensionsModel, key: KeyMsg): { model: ExtensionsModel; action: ExtensionsColumnAction; asyncFn?: () => Promise<ExtensionsModel> } {
	if (model.inputFocused) {
		return updateInputColumn(model, key);
	}

	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selected: Math.min(model.selected + 1, Math.max(0, model.filtered.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selected: Math.max(model.selected - 1, 0) },
				action: null,
			};
		case 'enter': {
			const ext = model.filtered[model.selected];
			if (!ext || model.installing) return { model, action: null };
			return {
				model: { ...model, installing: ext.id },
				action: null,
				asyncFn: async () => {
					try {
						if (ext.installed) {
							await api.uninstallExtension(ext.id);
						} else {
							await api.installExtension(ext);
						}
						return load({ ...model, installing: null });
					} catch {
						return { ...model, installing: null, error: `Failed to ${ext.installed ? 'uninstall' : 'install'} ${ext.name}` };
					}
				},
			};
		}
		case '/':
			return { model: { ...model, inputFocused: true, cursorPos: model.query.length }, action: null };
		case 'l': {
			const langs = ['', ...model.languages];
			const idx = langs.indexOf(model.langFilter);
			const next = langs[(idx + 1) % langs.length];
			const filtered = filterExtensions(model.all, model.query, next);
			return { model: { ...model, langFilter: next, filtered, selected: 0 }, action: null };
		}
		default:
			return { model, action: { type: 'pass' } };
	}
}

function updateInputColumn(model: ExtensionsModel, key: KeyMsg): { model: ExtensionsModel; action: ExtensionsColumnAction; asyncFn?: () => Promise<ExtensionsModel> } {
	switch (key.key) {
		case 'escape':
		case 'enter':
			return { model: { ...model, inputFocused: false }, action: null };
		case 'backspace': {
			if (model.cursorPos > 0) {
				const q = model.query.slice(0, model.cursorPos - 1) + model.query.slice(model.cursorPos);
				const filtered = filterExtensions(model.all, q, model.langFilter);
				return { model: { ...model, query: q, cursorPos: model.cursorPos - 1, filtered, selected: 0 }, action: null };
			}
			return { model, action: null };
		}
		case 'left':
			return { model: { ...model, cursorPos: Math.max(0, model.cursorPos - 1) }, action: null };
		case 'right':
			return { model: { ...model, cursorPos: Math.min(model.query.length, model.cursorPos + 1) }, action: null };
		default: {
			if (key.raw && key.raw.length === 1 && key.raw >= ' ') {
				const q = model.query.slice(0, model.cursorPos) + key.raw + model.query.slice(model.cursorPos);
				const filtered = filterExtensions(model.all, q, model.langFilter);
				return { model: { ...model, query: q, cursorPos: model.cursorPos + 1, filtered, selected: 0 }, action: null };
			}
			return { model, action: null };
		}
	}
}

/** Render extensions list as a single column panel. */
export function viewListColumn(model: ExtensionsModel, width: number, height: number, focused: boolean): string[] {
	const langLabel = model.langFilter || 'all';
	const panelTitle = `${icons.puzzle} Extensions (${model.filtered.length}) \u2500 ${langLabel}`;

	if (model.loading) {
		return renderPanel([colors.dim(' Loading...')], { title: panelTitle, active: focused, width, height });
	}
	if (model.error) {
		return renderPanel([colors.error(model.error)], { title: panelTitle, active: focused, width, height });
	}

	const innerW = width - 2;
	const content: string[] = [];

	// Search input
	const searchPrefix = model.inputFocused ? colors.accent(' / ') : colors.dim(' / ');
	if (model.inputFocused) {
		const before = model.query.slice(0, model.cursorPos);
		const cursor = model.query[model.cursorPos] ?? ' ';
		const after = model.query.slice(model.cursorPos + 1);
		content.push(`${searchPrefix}${colors.snow(before)}${colors.selBg(colors.accent(cursor))}${colors.snow(after)}`);
	} else if (model.query) {
		content.push(`${searchPrefix}${colors.snow(model.query)}`);
	} else {
		content.push(`${searchPrefix}${colors.dim('search...')}`);
	}
	content.push('');

	const listRows = height - 4;
	const win = listWindow(model.filtered.length, model.selected, listRows);
	let lastInstalled: boolean | null = null;

	for (const idx of win.visibleItems) {
		const ext = model.filtered[idx];
		const selected = idx === model.selected;

		if (lastInstalled !== null && lastInstalled !== ext.installed) {
			content.push(colors.dimmer(' ' + '\u2500'.repeat(Math.min(innerW - 2, 30))));
		}
		lastInstalled = ext.installed;

		const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
		const statusIcon = ext.installed ? colors.success('\u2713') : colors.dim('\u25cb');
		const installing = model.installing === ext.id;
		const nsfwTag = ext.isNsfw ? colors.error(' [18+]') : '';
		const langTag = colors.dim(` [${ext.lang}]`);
		const nameWidth = Math.max(1, innerW - 15);
		const name = truncate(ext.name, nameWidth);
		const nameStr = selected ? colors.selected(name) : (ext.installed ? colors.snow(name) : colors.dim(name));

		let line: string;
		if (installing) {
			line = `${prefix}${colors.warning('\u25cf')} ${nameStr}${langTag}${nsfwTag} ${colors.warning('...')}`;
		} else {
			line = `${prefix}${statusIcon} ${nameStr}${langTag}${nsfwTag}`;
		}

		if (selected) {
			content.push(colors.selBg(padAnsi(line, innerW)));
		} else {
			content.push(line);
		}
	}

	const scrollInfo = model.filtered.length > listRows
		? { total: model.filtered.length, offset: win.start, visible: listRows }
		: undefined;

	return renderPanel(content, { title: panelTitle, active: focused, width, height, scroll: scrollInfo });
}
