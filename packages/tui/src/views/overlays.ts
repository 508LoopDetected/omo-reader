/**
 * Floating overlay panels — library picker, collection manager, confirm, create form.
 * These render as centered panels over dimmed background content.
 */

import * as api from '../api.js';
import type { UserLibrary, WorkEntry, Chapter, ReadingProgress } from '../api.js';
import { colors, statusBar, listWindow, stripAnsi, truncate, loadingLine, progressBar } from '../ui.js';
import { renderPanel, padAnsi, icons, wrapText, renderOverlay as compositeOverlay } from '../layout.js';
import type { KeyMsg } from '../tea.js';
import type { FieldDef, ManagementActionDef } from '../manifest.js';

// ── Overlay State ──

export type OverlayState =
	| { type: 'libraryPicker'; model: LibraryPickerModel }
	| { type: 'collectionManager'; model: CollectionManagerModel }
	| { type: 'confirm'; model: ConfirmModel }
	| { type: 'createForm'; model: CreateFormModel }
	| { type: 'chapterBrowser'; model: ChapterBrowserModel }
	| null;

// ── Overlay Actions ──

export type OverlayAction =
	| { type: 'close' }
	| { type: 'selectLibrary'; libraryId: string }
	| { type: 'toggleCollection'; collectionId: string; add: boolean }
	| { type: 'confirm'; action: ManagementActionDef }
	| { type: 'submitForm'; endpoint: string; data: Record<string, string> }
	| { type: 'readChapter'; sourceId: string; workId: string; chapterId: string }
	| null;

// ── Library Picker ──

export interface LibraryPickerModel {
	libraries: UserLibrary[];
	selected: number;
	sourceId: string;
	workId: string;
}

export function initLibraryPicker(libraries: UserLibrary[], sourceId: string, workId: string): LibraryPickerModel {
	return { libraries, selected: 0, sourceId, workId };
}

function updateLibraryPicker(model: LibraryPickerModel, key: KeyMsg): { model: LibraryPickerModel; action: OverlayAction } {
	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selected: Math.min(model.selected + 1, Math.max(0, model.libraries.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selected: Math.max(model.selected - 1, 0) },
				action: null,
			};
		case 'enter': {
			const lib = model.libraries[model.selected];
			if (!lib) return { model, action: null };
			return { model, action: { type: 'selectLibrary', libraryId: lib.id } };
		}
		case 'q':
		case 'escape':
			return { model, action: { type: 'close' } };
		default:
			return { model, action: null };
	}
}

function viewLibraryPicker(model: LibraryPickerModel, maxW: number, maxH: number): string[] {
	const panelW = Math.min(40, maxW - 4);
	const innerW = panelW - 2;
	const content: string[] = [];

	if (model.libraries.length === 0) {
		content.push('');
		content.push(colors.dim(' No libraries.'));
		content.push(colors.dim(' Create in Settings.'));
	} else {
		const listRows = Math.min(model.libraries.length, maxH - 6);
		const win = listWindow(model.libraries.length, model.selected, listRows);

		for (const idx of win.visibleItems) {
			const lib = model.libraries[idx];
			const selected = idx === model.selected;
			const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
			const typeTag = colors.dim(` [${lib.type}]`);
			const label = selected ? colors.selected(lib.name) : colors.snow(lib.name);
			const line = `${prefix}${label}${typeTag}`;

			if (selected) {
				content.push(colors.selBg(padAnsi(line, innerW)));
			} else {
				content.push(line);
			}
		}
	}

	content.push('');
	content.push(statusBar(['\u2191\u2193 navigate', 'Enter select', 'Esc cancel'], panelW));

	return renderPanel(content, {
		title: `${icons.library} Add to Library`,
		active: true,
		width: panelW,
		height: content.length + 2,
	});
}

// ── Collection Manager ──

export interface CollectionManagerModel {
	collections: { id: string; label: string }[];
	memberIds: Set<string>;
	selected: number;
	sourceId: string;
	workId: string;
}

export function initCollectionManager(
	collections: { id: string; label: string }[],
	memberIds: Set<string>,
	sourceId: string,
	workId: string,
): CollectionManagerModel {
	return { collections, memberIds: new Set(memberIds), selected: 0, sourceId, workId };
}

function updateCollectionManager(model: CollectionManagerModel, key: KeyMsg): { model: CollectionManagerModel; action: OverlayAction } {
	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selected: Math.min(model.selected + 1, Math.max(0, model.collections.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selected: Math.max(model.selected - 1, 0) },
				action: null,
			};
		case 'enter':
		case ' ': {
			const col = model.collections[model.selected];
			if (!col) return { model, action: null };
			const isMember = model.memberIds.has(col.id);
			const newIds = new Set(model.memberIds);
			if (isMember) {
				newIds.delete(col.id);
			} else {
				newIds.add(col.id);
			}
			return {
				model: { ...model, memberIds: newIds },
				action: { type: 'toggleCollection', collectionId: col.id, add: !isMember },
			};
		}
		case 'q':
		case 'escape':
			return { model, action: { type: 'close' } };
		default:
			return { model, action: null };
	}
}

function viewCollectionManager(model: CollectionManagerModel, maxW: number, maxH: number): string[] {
	const panelW = Math.min(44, maxW - 4);
	const innerW = panelW - 2;
	const content: string[] = [];

	if (model.collections.length === 0) {
		content.push('');
		content.push(colors.dim(' No collections.'));
		content.push(colors.dim(' Create in Settings.'));
	} else {
		const listRows = Math.min(model.collections.length, maxH - 6);
		const win = listWindow(model.collections.length, model.selected, listRows);

		for (const idx of win.visibleItems) {
			const col = model.collections[idx];
			const selected = idx === model.selected;
			const isMember = model.memberIds.has(col.id);
			const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
			const checkbox = isMember ? colors.success('[x]') : colors.dim('[ ]');
			const label = selected ? colors.selected(col.label) : colors.snow(col.label);
			const line = `${prefix}${checkbox} ${label}`;

			if (selected) {
				content.push(colors.selBg(padAnsi(line, innerW)));
			} else {
				content.push(line);
			}
		}
	}

	content.push('');
	content.push(statusBar(['\u2191\u2193 navigate', 'Enter toggle', 'Esc close'], panelW));

	return renderPanel(content, {
		title: `${icons.folder} Collections`,
		active: true,
		width: panelW,
		height: content.length + 2,
	});
}

// ── Confirm Dialog ──

export interface ConfirmModel {
	message: string;
	dangerous: boolean;
	action: ManagementActionDef;
	itemId?: string;
}

export function initConfirm(message: string, action: ManagementActionDef, dangerous: boolean = false, itemId?: string): ConfirmModel {
	return { message, dangerous, action, itemId };
}

function updateConfirm(model: ConfirmModel, key: KeyMsg): { model: ConfirmModel; action: OverlayAction } {
	switch (key.key) {
		case 'y':
		case 'enter':
			return { model, action: { type: 'confirm', action: model.action } };
		case 'n':
		case 'escape':
			return { model, action: { type: 'close' } };
		default:
			return { model, action: null };
	}
}

function viewConfirm(model: ConfirmModel, maxW: number, _maxH: number): string[] {
	const panelW = Math.min(48, maxW - 4);
	const innerW = panelW - 2;
	const content: string[] = [];

	content.push('');
	content.push(model.dangerous ? colors.error(' \u26a0 Confirm') : colors.warning(' Confirm'));
	content.push('');

	const msgLines = model.message.split('\n');
	for (const ml of msgLines) {
		content.push(ml.trim() ? ` ${colors.snow(ml.trim())}` : '');
	}
	content.push('');
	content.push(colors.accent(' [y] Yes   [n/Esc] Cancel'));

	content.push('');
	content.push(statusBar(['y confirm', 'n/Esc cancel'], panelW));

	return renderPanel(content, {
		title: model.dangerous ? '\u26a0 Confirm' : 'Confirm',
		active: true,
		width: panelW,
		height: content.length + 2,
	});
}

// ── Create Form ──

export interface CreateFormModel {
	fields: { key: string; value: string; cursorPos: number; fieldDef: FieldDef }[];
	activeField: number;
	endpoint: string;
	title: string;
}

export function initCreateForm(fields: FieldDef[], endpoint: string, title: string): CreateFormModel {
	return {
		fields: fields.map(f => ({
			key: f.key,
			value: f.defaultValue ?? '',
			cursorPos: 0,
			fieldDef: f,
		})),
		activeField: 0,
		endpoint,
		title,
	};
}

function updateCreateForm(model: CreateFormModel, key: KeyMsg): { model: CreateFormModel; action: OverlayAction } {
	const fields = model.fields;
	const active = fields[model.activeField];
	if (!active) return { model, action: { type: 'close' } };

	// Tab to move between fields
	if (key.key === 'tab') {
		const next = (model.activeField + 1) % fields.length;
		return { model: { ...model, activeField: next }, action: null };
	}

	// For select fields: left/right cycle options
	if (active.fieldDef.type === 'select' && active.fieldDef.options) {
		if (key.key === 'left' || key.key === 'right') {
			const opts = active.fieldDef.options;
			const current = active.value || active.fieldDef.defaultValue || '';
			const idx = opts.findIndex(o => o.value === current);
			const nextIdx = key.key === 'right'
				? (idx + 1) % opts.length
				: (idx - 1 + opts.length) % opts.length;
			const newFields = [...fields];
			newFields[model.activeField] = { ...active, value: opts[nextIdx].value };
			return { model: { ...model, fields: newFields }, action: null };
		}
	}

	switch (key.key) {
		case 'escape':
			return { model, action: { type: 'close' } };
		case 'enter': {
			// Check required fields
			const allValid = fields.every(f => !f.fieldDef.required || f.value.trim() !== '');
			if (!allValid) return { model, action: null };

			const data: Record<string, string> = {};
			for (const f of fields) {
				data[f.key] = f.value.trim();
			}
			return { model, action: { type: 'submitForm', endpoint: model.endpoint, data } };
		}
		default: {
			if (active.fieldDef.type === 'select') return { model, action: null };

			const newFields = [...fields];
			const f = { ...active };

			if (key.key === 'backspace') {
				if (f.cursorPos > 0) {
					f.value = f.value.slice(0, f.cursorPos - 1) + f.value.slice(f.cursorPos);
					f.cursorPos--;
				}
			} else if (key.key === 'left') {
				f.cursorPos = Math.max(0, f.cursorPos - 1);
			} else if (key.key === 'right') {
				f.cursorPos = Math.min(f.value.length, f.cursorPos + 1);
			} else if (key.raw && key.raw.length === 1 && key.raw >= ' ') {
				f.value = f.value.slice(0, f.cursorPos) + key.raw + f.value.slice(f.cursorPos);
				f.cursorPos++;
			}

			newFields[model.activeField] = f;
			return { model: { ...model, fields: newFields }, action: null };
		}
	}
}

function viewCreateForm(model: CreateFormModel, maxW: number, _maxH: number): string[] {
	const panelW = Math.min(52, maxW - 4);
	const innerW = panelW - 2;
	const content: string[] = [];

	content.push(colors.frost(' Create New'));
	content.push('');

	for (let i = 0; i < model.fields.length; i++) {
		const f = model.fields[i];
		const isActive = i === model.activeField;
		const labelColor = isActive ? colors.accent : colors.dim;
		const required = f.fieldDef.required ? ' *' : '';

		content.push(labelColor(` ${f.fieldDef.label}${required}`));

		if (f.fieldDef.type === 'select' && f.fieldDef.options) {
			const currentVal = f.value || f.fieldDef.defaultValue || '';
			const opt = f.fieldDef.options.find(o => o.value === currentVal);
			const label = opt?.label ?? currentVal;
			if (isActive) {
				content.push(colors.accent(`   \u25c0 ${label} \u25b6`));
			} else {
				content.push(colors.snow(`   ${label}`));
			}
		} else {
			const displayVal = f.fieldDef.type === 'password' ? '\u2022'.repeat(f.value.length) : f.value;
			if (isActive) {
				const before = displayVal.slice(0, f.cursorPos);
				const cursor = displayVal[f.cursorPos] ?? ' ';
				const after = displayVal.slice(f.cursorPos + 1);
				content.push(`   ${colors.snow(before)}${colors.selBg(colors.accent(cursor))}${colors.snow(after)}`);
			} else {
				const placeholder = !displayVal && f.fieldDef.placeholder ? colors.dim(f.fieldDef.placeholder) : colors.snow(displayVal);
				content.push(`   ${placeholder}`);
			}
		}
		content.push('');
	}

	content.push(statusBar(['Tab next', '\u2190\u2192 options', 'Enter submit', 'Esc cancel'], panelW));

	return renderPanel(content, {
		title: `${model.title} \u2500 New`,
		active: true,
		width: panelW,
		height: content.length + 2,
	});
}

// ── Chapter Browser ──

const READ_THRESHOLD = 2;

function isChapterRead(progress: Map<string, ReadingProgress>, chId: string): boolean {
	const prog = progress.get(chId);
	if (!prog) return false;
	return prog.totalPages > 0 && prog.page >= prog.totalPages - READ_THRESHOLD;
}

function isChapterInProgress(progress: Map<string, ReadingProgress>, chId: string): boolean {
	const prog = progress.get(chId);
	if (!prog) return false;
	return prog.page > 0 && !isChapterRead(progress, chId);
}

export interface ChapterBrowserModel {
	sourceId: string;
	workId: string;
	initialTitle: string;
	work: WorkEntry | null;
	chapters: Chapter[];
	progress: Map<string, ReadingProgress>;
	selected: number;
	sortDesc: boolean;
	loading: boolean;
	error: string | null;
	inLibrary: boolean;
	currentLibraryId: string | null;
	userLibraries: UserLibrary[];
	allCollections: { id: string; label: string }[];
	memberCollectionIds: Set<string>;
	// Sub-modal state
	subMode: 'none' | 'libraryPicker' | 'collectionManager';
	subSelected: number;
	// Info view toggle
	showInfo: boolean;
	infoScroll: number;
}

export function initChapterBrowser(sourceId: string, workId: string, initialTitle: string): ChapterBrowserModel {
	return {
		sourceId, workId, initialTitle,
		work: null, chapters: [], progress: new Map(),
		selected: 0, sortDesc: true, loading: true, error: null,
		inLibrary: false, currentLibraryId: null,
		userLibraries: [], allCollections: [], memberCollectionIds: new Set(),
		subMode: 'none', subSelected: 0,
		showInfo: false, infoScroll: 0,
	};
}

export async function loadChapterBrowser(model: ChapterBrowserModel): Promise<ChapterBrowserModel> {
	try {
		const composite = await api.getWorkComposite(model.sourceId, model.workId, model.initialTitle);
		const progressMap = new Map<string, ReadingProgress>();
		for (const [chId, prog] of Object.entries(composite.progressMap)) {
			progressMap.set(chId, {
				workId: model.workId,
				sourceId: model.sourceId,
				chapterId: chId,
				page: prog.page,
				totalPages: prog.totalPages,
				updatedAt: 0,
			});
		}
		let chapters = composite.chapters;
		if (model.sortDesc) {
			chapters = [...chapters].sort((a, b) => (b.chapterNumber ?? 0) - (a.chapterNumber ?? 0));
		} else {
			chapters = [...chapters].sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
		}
		return {
			...model,
			work: composite.work,
			chapters,
			progress: progressMap,
			loading: false,
			error: null,
			inLibrary: composite.inLibrary,
			currentLibraryId: composite.libraryId ?? null,
			userLibraries: composite.userLibraries,
			allCollections: composite.collections.map(c => ({ id: c.id, label: c.name })),
			memberCollectionIds: new Set(composite.titleCollectionIds),
		};
	} catch (err) {
		return { ...model, loading: false, error: String(err) };
	}
}

function updateChapterBrowser(model: ChapterBrowserModel, key: KeyMsg): {
	model: ChapterBrowserModel;
	action: OverlayAction;
	asyncFn?: () => Promise<ChapterBrowserModel>;
} {
	if (model.subMode === 'libraryPicker') return updateCBLibraryPicker(model, key);
	if (model.subMode === 'collectionManager') return updateCBCollectionManager(model, key);

	// Info view mode — j/k scroll, i/Esc exit
	if (model.showInfo) {
		switch (key.key) {
			case 'j':
			case 'down':
				return { model: { ...model, infoScroll: model.infoScroll + 1 }, action: null };
			case 'k':
			case 'up':
				return { model: { ...model, infoScroll: Math.max(0, model.infoScroll - 1) }, action: null };
			case 'i':
			case 'escape':
				return { model: { ...model, showInfo: false }, action: null };
			default:
				return { model, action: null };
		}
	}

	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selected: Math.min(model.selected + 1, Math.max(0, model.chapters.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selected: Math.max(model.selected - 1, 0) },
				action: null,
			};
		case 'i':
			return { model: { ...model, showInfo: true, infoScroll: 0 }, action: null };
		case 'enter': {
			const ch = model.chapters[model.selected];
			if (!ch) return { model, action: null };
			return { model, action: { type: 'readChapter', sourceId: model.sourceId, workId: model.workId, chapterId: ch.id } };
		}
		case 'a': {
			if (!model.work) return { model, action: null };
			if (model.inLibrary) {
				return {
					model: { ...model, inLibrary: false, currentLibraryId: null },
					action: null,
					asyncFn: async () => {
						await api.removeFromLibrary(model.sourceId, model.workId);
						return { ...model, inLibrary: false, currentLibraryId: null };
					},
				};
			}
			if (model.userLibraries.length <= 1) {
				const libraryId = model.userLibraries[0]?.id;
				const work = model.work;
				return {
					model: { ...model, inLibrary: true, currentLibraryId: libraryId ?? null },
					action: null,
					asyncFn: async () => {
						await api.addToLibrary(work, libraryId);
						return { ...model, inLibrary: true, currentLibraryId: libraryId ?? null };
					},
				};
			}
			return { model: { ...model, subMode: 'libraryPicker', subSelected: 0 }, action: null };
		}
		case 'c':
			return { model: { ...model, subMode: 'collectionManager', subSelected: 0 }, action: null };
		case 'm': {
			const ch = model.chapters[model.selected];
			if (!ch) return { model, action: null };
			const isRead = isChapterRead(model.progress, ch.id);
			return {
				model,
				action: null,
				asyncFn: async () => {
					await api.markChapter(model.sourceId, model.workId, ch.id, !isRead);
					return loadChapterBrowser(model);
				},
			};
		}
		case 's': {
			const chapters = [...model.chapters].reverse();
			return { model: { ...model, sortDesc: !model.sortDesc, chapters, selected: 0 }, action: null };
		}
		case 'q':
		case 'escape':
			return { model, action: { type: 'close' } };
		default:
			return { model, action: null };
	}
}

function updateCBLibraryPicker(model: ChapterBrowserModel, key: KeyMsg): {
	model: ChapterBrowserModel; action: OverlayAction; asyncFn?: () => Promise<ChapterBrowserModel>;
} {
	switch (key.key) {
		case 'j':
		case 'down':
			return { model: { ...model, subSelected: Math.min(model.subSelected + 1, Math.max(0, model.userLibraries.length - 1)) }, action: null };
		case 'k':
		case 'up':
			return { model: { ...model, subSelected: Math.max(model.subSelected - 1, 0) }, action: null };
		case 'enter': {
			const lib = model.userLibraries[model.subSelected];
			if (!lib || !model.work) return { model, action: null };
			const work = model.work;
			return {
				model: { ...model, subMode: 'none', inLibrary: true, currentLibraryId: lib.id },
				action: null,
				asyncFn: async () => {
					await api.addToLibrary(work, lib.id);
					return { ...model, subMode: 'none', inLibrary: true, currentLibraryId: lib.id };
				},
			};
		}
		case 'escape':
			return { model: { ...model, subMode: 'none' }, action: null };
		default:
			return { model, action: null };
	}
}

function updateCBCollectionManager(model: ChapterBrowserModel, key: KeyMsg): {
	model: ChapterBrowserModel; action: OverlayAction; asyncFn?: () => Promise<ChapterBrowserModel>;
} {
	switch (key.key) {
		case 'j':
		case 'down':
			return { model: { ...model, subSelected: Math.min(model.subSelected + 1, Math.max(0, model.allCollections.length - 1)) }, action: null };
		case 'k':
		case 'up':
			return { model: { ...model, subSelected: Math.max(model.subSelected - 1, 0) }, action: null };
		case 'enter':
		case ' ': {
			const col = model.allCollections[model.subSelected];
			if (!col) return { model, action: null };
			const isMember = model.memberCollectionIds.has(col.id);
			const newIds = new Set(model.memberCollectionIds);
			if (isMember) newIds.delete(col.id);
			else newIds.add(col.id);
			return {
				model: { ...model, memberCollectionIds: newIds },
				action: null,
				asyncFn: async () => {
					try {
						if (isMember) await api.removeFromCollection(col.id, model.sourceId, model.workId);
						else await api.addToCollection(col.id, model.sourceId, model.workId);
					} catch { /* ignore */ }
					return { ...model, memberCollectionIds: newIds };
				},
			};
		}
		case 'escape':
			return { model: { ...model, subMode: 'none' }, action: null };
		default:
			return { model, action: null };
	}
}

function viewChapterBrowser(model: ChapterBrowserModel, maxW: number, maxH: number): string[] {
	const panelW = Math.min(76, Math.max(48, Math.floor(maxW * 0.75)));
	const panelH = Math.max(12, Math.floor(maxH * 0.8));
	const innerW = panelW - 2;
	const title = model.work?.title ?? model.initialTitle;

	if (model.loading) {
		const content = [loadingLine()];
		return renderPanel(content, { title: truncate(title, panelW - 4), active: true, width: panelW, height: Math.min(5, panelH) });
	}
	if (model.error) {
		const content = [colors.error(model.error)];
		return renderPanel(content, { title: truncate(title, panelW - 4), active: true, width: panelW, height: Math.min(5, panelH) });
	}

	const content: string[] = [];
	const work = model.work;

	// Compact work info header
	if (work?.author) {
		content.push(colors.frost(` ${work.author}`));
	}
	const infoParts: string[] = [];
	if (work?.status) infoParts.push(work.status);
	if (work?.genres?.length) infoParts.push(work.genres.slice(0, 5).join(', '));
	if (infoParts.length) {
		content.push(colors.dim(` ${infoParts.join(' \u00b7 ')}`));
	}

	// Library status
	const libLabel = model.inLibrary ? colors.success(' \u2713 Library') : colors.dim(' + Library (a)');
	content.push(libLabel);
	content.push(colors.dimmer(' ' + '\u2500'.repeat(Math.min(innerW - 2, 40))));

	const headerRows = content.length;
	// 2 border lines + 2 hint lines (empty + bar) = 4 overhead
	const bodyRows = Math.max(1, panelH - headerRows - 4);

	let scrollInfo: { total: number; offset: number; visible: number } | undefined;

	if (model.showInfo) {
		// Full info/description view
		const descLines: string[] = [];
		if (work?.description) {
			const clean = work.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
			if (clean) {
				descLines.push(...wrapText(clean, innerW - 1, colors.dim));
			}
		}
		if (descLines.length === 0) {
			descLines.push(colors.dim(' No description available.'));
		}
		// Clamp scroll
		const maxScroll = Math.max(0, descLines.length - bodyRows);
		const scroll = Math.min(model.infoScroll, maxScroll);
		const visible = descLines.slice(scroll, scroll + bodyRows);
		content.push(...visible);
		if (descLines.length > bodyRows) {
			scrollInfo = { total: descLines.length, offset: scroll, visible: bodyRows };
		}
		// Hints for info view
		content.push('');
		content.push(statusBar(['\u2191\u2193 scroll', 'i back', 'Esc back'], panelW));
	} else {
		// Chapter list view
		if (model.chapters.length === 0) {
			content.push(colors.dim(' No chapters available.'));
		} else {
			const win = listWindow(model.chapters.length, model.selected, bodyRows);
			for (const idx of win.visibleItems) {
				const ch = model.chapters[idx];
				const selected = idx === model.selected;
				const read = isChapterRead(model.progress, ch.id);
				const inProg = isChapterInProgress(model.progress, ch.id);
				const prog = model.progress.get(ch.id);

				let readIndicator: string;
				let indicatorLen: number;
				if (read) {
					readIndicator = colors.success(' \u2713');
					indicatorLen = 2;
				} else if (inProg && prog) {
					const pBar = progressBar(prog.page, prog.totalPages, 6);
					const pText = ` ${pBar} ${prog.page + 1}/${prog.totalPages}`;
					readIndicator = pText;
					indicatorLen = stripAnsi(pText).length;
				} else {
					readIndicator = colors.warning(' \u25cf');
					indicatorLen = 2;
				}

				const chTitleWidth = Math.max(1, innerW - 3 - indicatorLen);
				const chTitle = truncate(ch.title, chTitleWidth);
				const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
				const titleStr = selected ? colors.selected(chTitle) : (read ? colors.dim(chTitle) : colors.snow(chTitle));
				const line = `${prefix}${titleStr}${readIndicator}`;

				if (selected) {
					content.push(colors.selBg(padAnsi(line, innerW)));
				} else {
					content.push(line);
				}
			}
			if (model.chapters.length > bodyRows) {
				scrollInfo = { total: model.chapters.length, offset: win.start, visible: bodyRows };
			}
		}
		// Hints for chapter view
		content.push('');
		content.push(statusBar(['\u2191\u2193 navigate', 'Enter read', 'i info', 'm mark', 's sort', 'a library', 'c collections', 'Esc close'], panelW));
	}

	let rendered = renderPanel(content, {
		title: truncate(title, panelW - 4),
		active: true,
		width: panelW,
		height: panelH,
		scroll: scrollInfo,
	});

	// Sub-modal compositing
	if (model.subMode === 'libraryPicker') {
		const sub = viewCBLibraryPicker(model, panelW, panelH);
		rendered = compositeOverlay(rendered, sub, panelW, rendered.length);
	} else if (model.subMode === 'collectionManager') {
		const sub = viewCBCollectionManager(model, panelW, panelH);
		rendered = compositeOverlay(rendered, sub, panelW, rendered.length);
	}

	return rendered;
}

function viewCBLibraryPicker(model: ChapterBrowserModel, maxW: number, _maxH: number): string[] {
	const panelW = Math.min(36, maxW - 6);
	const innerW = panelW - 2;
	const content: string[] = [];

	if (model.userLibraries.length === 0) {
		content.push(colors.dim(' No libraries.'));
	} else {
		for (let i = 0; i < model.userLibraries.length; i++) {
			const lib = model.userLibraries[i];
			const selected = i === model.subSelected;
			const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
			const typeTag = colors.dim(` [${lib.type}]`);
			const label = selected ? colors.selected(lib.name) : colors.snow(lib.name);
			const line = `${prefix}${label}${typeTag}`;
			if (selected) {
				content.push(colors.selBg(padAnsi(line, innerW)));
			} else {
				content.push(line);
			}
		}
	}

	return renderPanel(content, {
		title: `${icons.library} Add to Library`,
		active: true,
		width: panelW,
		height: content.length + 2,
	});
}

function viewCBCollectionManager(model: ChapterBrowserModel, maxW: number, _maxH: number): string[] {
	const panelW = Math.min(40, maxW - 6);
	const innerW = panelW - 2;
	const content: string[] = [];

	if (model.allCollections.length === 0) {
		content.push(colors.dim(' No collections.'));
	} else {
		for (let i = 0; i < model.allCollections.length; i++) {
			const col = model.allCollections[i];
			const selected = i === model.subSelected;
			const isMember = model.memberCollectionIds.has(col.id);
			const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
			const checkbox = isMember ? colors.success('[x]') : colors.dim('[ ]');
			const label = selected ? colors.selected(col.label) : colors.snow(col.label);
			const line = `${prefix}${checkbox} ${label}`;
			if (selected) {
				content.push(colors.selBg(padAnsi(line, innerW)));
			} else {
				content.push(line);
			}
		}
	}

	return renderPanel(content, {
		title: `${icons.folder} Collections`,
		active: true,
		width: panelW,
		height: content.length + 2,
	});
}

// ── Unified Update / View ──

export function updateOverlay(overlay: OverlayState, key: KeyMsg): { overlay: OverlayState; action: OverlayAction; asyncFn?: () => Promise<OverlayState> } {
	if (!overlay) return { overlay: null, action: null };

	switch (overlay.type) {
		case 'libraryPicker': {
			const result = updateLibraryPicker(overlay.model, key);
			if (result.action?.type === 'close') return { overlay: null, action: result.action };
			return { overlay: { type: 'libraryPicker', model: result.model }, action: result.action };
		}
		case 'collectionManager': {
			const result = updateCollectionManager(overlay.model, key);
			if (result.action?.type === 'close') return { overlay: null, action: result.action };
			return { overlay: { type: 'collectionManager', model: result.model }, action: result.action };
		}
		case 'confirm': {
			const result = updateConfirm(overlay.model, key);
			if (result.action?.type === 'close') return { overlay: null, action: result.action };
			return { overlay: { type: 'confirm', model: result.model }, action: result.action };
		}
		case 'createForm': {
			const result = updateCreateForm(overlay.model, key);
			if (result.action?.type === 'close') return { overlay: null, action: result.action };
			return { overlay: { type: 'createForm', model: result.model }, action: result.action };
		}
		case 'chapterBrowser': {
			const result = updateChapterBrowser(overlay.model, key);
			if (result.action?.type === 'close') return { overlay: null, action: result.action };
			const newOverlay: OverlayState = { type: 'chapterBrowser', model: result.model };
			return {
				overlay: newOverlay,
				action: result.action,
				asyncFn: result.asyncFn
					? async () => {
						const updated = await result.asyncFn!();
						return { type: 'chapterBrowser' as const, model: updated };
					}
					: undefined,
			};
		}
	}
}

export function viewOverlay(overlay: OverlayState, cols: number, rows: number): string[] | null {
	if (!overlay) return null;

	switch (overlay.type) {
		case 'libraryPicker':
			return viewLibraryPicker(overlay.model, cols, rows);
		case 'collectionManager':
			return viewCollectionManager(overlay.model, cols, rows);
		case 'confirm':
			return viewConfirm(overlay.model, cols, rows);
		case 'createForm':
			return viewCreateForm(overlay.model, cols, rows);
		case 'chapterBrowser':
			return viewChapterBrowser(overlay.model, cols, rows);
	}
}
