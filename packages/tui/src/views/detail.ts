/**
 * Detail view — work info + chapter list in split panels.
 */

import * as api from '../api.js';
import type { WorkEntry, Chapter, ReadingProgress, UserLibrary } from '../api.js';
import { colors, statusBar, listWindow, truncate, loadingLine, progressBar, stripAnsi } from '../ui.js';
import { renderPanel, sideBySide, computeSplitLayout, padAnsi, truncAnsi, wrapText, icons } from '../layout.js';
import type { Msg, KeyMsg } from '../tea.js';
import type { AppManifest, ActionDef } from '../manifest.js';
import { getTuiActions } from '../manifest.js';

export interface DetailModel {
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
	actions: ActionDef[];
	// Library picker overlay
	libraryOverlay: boolean;
	userLibraries: UserLibrary[];
	librarySelected: number;
	// Collection management overlay
	collectionsOverlay: boolean;
	allCollections: { id: string; label: string }[];
	memberCollectionIds: Set<string>;
	collectionSelected: number;
}

export function init(sourceId: string, workId: string, title: string, manifest?: AppManifest | null): DetailModel {
	const actions = manifest ? getTuiActions(manifest, 'detail') : [];
	return {
		sourceId,
		workId,
		initialTitle: title,
		work: null,
		chapters: [],
		progress: new Map(),
		selected: 0,
		sortDesc: true,
		loading: true,
		error: null,
		inLibrary: false,
		currentLibraryId: null,
		actions,
		libraryOverlay: false,
		userLibraries: [],
		librarySelected: 0,
		collectionsOverlay: false,
		allCollections: [],
		memberCollectionIds: new Set(),
		collectionSelected: 0,
	};
}

export async function load(model: DetailModel): Promise<DetailModel> {
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

export type DetailAction =
	| { type: 'reader'; sourceId: string; workId: string; chapterId: string; title: string }
	| { type: 'back' }
	| null;

export function update(model: DetailModel, msg: Msg): { model: DetailModel; action: DetailAction; asyncFn?: () => Promise<DetailModel> } {
	if (msg.type !== 'key') return { model, action: null };
	const key = msg as KeyMsg;

	// Library picker overlay mode
	if (model.libraryOverlay) {
		return updateLibraryOverlay(model, key);
	}

	// Collection overlay mode
	if (model.collectionsOverlay) {
		return updateCollectionsOverlay(model, key);
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
		case 'enter': {
			const ch = model.chapters[model.selected];
			if (!ch) return { model, action: null };
			return {
				model,
				action: {
					type: 'reader',
					sourceId: model.sourceId,
					workId: model.workId,
					chapterId: ch.id,
					title: ch.title,
				},
			};
		}
		case 'a': {
			if (!model.work) return { model, action: null };
			if (model.inLibrary) {
				// Already in library — remove
				return {
					model: { ...model, inLibrary: false, currentLibraryId: null },
					action: null,
					asyncFn: async () => {
						await api.removeFromLibrary(model.sourceId, model.workId);
						return { ...model, inLibrary: false, currentLibraryId: null };
					},
				};
			}
			// Not in library — show picker if multiple libraries exist, otherwise add to default
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
			// Multiple libraries — open picker overlay
			return {
				model: { ...model, libraryOverlay: true, librarySelected: 0 },
				action: null,
			};
		}
		case 'c': {
			// Open collections overlay (data pre-populated from load)
			return {
				model: { ...model, collectionsOverlay: true, collectionSelected: 0 },
				action: null,
			};
		}
		case 'm': {
			const ch = model.chapters[model.selected];
			if (!ch) return { model, action: null };
			const isRead = model.progress.has(ch.id);
			return {
				model,
				action: null,
				asyncFn: async () => {
					await api.markChapter(model.sourceId, model.workId, ch.id, !isRead);
					return load(model);
				},
			};
		}
		case 's': {
			const newSortDesc = !model.sortDesc;
			const chapters = [...model.chapters].reverse();
			return {
				model: { ...model, sortDesc: newSortDesc, chapters, selected: 0 },
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

function updateCollectionsOverlay(model: DetailModel, key: KeyMsg): { model: DetailModel; action: DetailAction; asyncFn?: () => Promise<DetailModel> } {
	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, collectionSelected: Math.min(model.collectionSelected + 1, Math.max(0, model.allCollections.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, collectionSelected: Math.max(model.collectionSelected - 1, 0) },
				action: null,
			};
		case 'enter':
		case ' ': {
			// Toggle collection membership
			const col = model.allCollections[model.collectionSelected];
			if (!col) return { model, action: null };
			const isMember = model.memberCollectionIds.has(col.id);
			const newIds = new Set(model.memberCollectionIds);
			if (isMember) {
				newIds.delete(col.id);
			} else {
				newIds.add(col.id);
			}
			return {
				model: { ...model, memberCollectionIds: newIds },
				action: null,
				asyncFn: async () => {
					try {
						if (isMember) {
							await api.removeFromCollection(col.id, model.sourceId, model.workId);
						} else {
							await api.addToCollection(col.id, model.sourceId, model.workId);
						}
					} catch { /* ignore */ }
					return { ...model, memberCollectionIds: newIds };
				},
			};
		}
		case 'q':
		case 'escape':
			return {
				model: { ...model, collectionsOverlay: false },
				action: null,
			};
		default:
			return { model, action: null };
	}
}

function updateLibraryOverlay(model: DetailModel, key: KeyMsg): { model: DetailModel; action: DetailAction; asyncFn?: () => Promise<DetailModel> } {
	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, librarySelected: Math.min(model.librarySelected + 1, Math.max(0, model.userLibraries.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, librarySelected: Math.max(model.librarySelected - 1, 0) },
				action: null,
			};
		case 'enter': {
			const lib = model.userLibraries[model.librarySelected];
			if (!lib || !model.work) return { model, action: null };
			const work = model.work;
			return {
				model: { ...model, libraryOverlay: false, inLibrary: true, currentLibraryId: lib.id },
				action: null,
				asyncFn: async () => {
					await api.addToLibrary(work, lib.id);
					return { ...model, libraryOverlay: false, inLibrary: true, currentLibraryId: lib.id };
				},
			};
		}
		case 'q':
		case 'escape':
			return {
				model: { ...model, libraryOverlay: false },
				action: null,
			};
		default:
			return { model, action: null };
	}
}

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

export function view(model: DetailModel, cols: number, rows: number): string {
	// Library picker overlay takes over the screen
	if (model.libraryOverlay) {
		return viewLibraryOverlay(model, cols, rows);
	}

	// Collections overlay takes over the screen
	if (model.collectionsOverlay) {
		return viewCollectionsOverlay(model, cols, rows);
	}

	const lines: string[] = [];
	const narrow = cols < 60;
	const work = model.work;
	const title = work?.title ?? model.initialTitle;

	if (model.loading) {
		const content = [loadingLine()];
		const panel = renderPanel(content, { title: `${icons.info} ${truncate(title, cols - 8)}`, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else if (model.error) {
		const content = [colors.error(model.error)];
		const panel = renderPanel(content, { title: `${icons.info} ${truncate(title, cols - 8)}`, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else if (narrow) {
		// Narrow: single panel with chapter list only
		const readCount = model.chapters.filter(c => isChapterRead(model.progress, c.id)).length;
		const chapterTitle = `${icons.list} Chapters (${model.chapters.length})`;
		const panelH = rows - 1;
		const listRows = panelH - 2;
		const listContent = buildChapterList(model, listRows, cols - 2);

		const scrollInfo = model.chapters.length > listRows
			? { total: model.chapters.length, offset: 0, visible: listRows }
			: undefined;

		const panel = renderPanel(listContent, {
			title: chapterTitle,
			active: true,
			width: cols,
			height: panelH,
			scroll: scrollInfo,
		});
		lines.push(...panel);
	} else {
		const layout = computeSplitLayout(cols, rows, 0.4, 0, 1);

		// Left panel: work info (passive)
		const infoContent = buildInfoPanel(model, layout.leftWidth - 3);
		const leftPanel = renderPanel(infoContent, {
			title: `${icons.info} ${truncate(title, layout.leftWidth - 8)}`,
			active: false,
			width: layout.leftWidth,
			height: layout.panelHeight,
		});

		// Right panel: chapter list (active)
		const readCount = model.chapters.filter(c => isChapterRead(model.progress, c.id)).length;
		let chapterTitle = `${icons.list} Chapters (${model.chapters.length})`;
		if (readCount > 0) chapterTitle += ` \u2500 ${readCount} read`;
		const listRows = layout.panelHeight - 2;
		const chapterContent = buildChapterList(model, listRows, layout.rightWidth - 2);

		const win = listWindow(model.chapters.length, model.selected, listRows);
		const scrollInfo = model.chapters.length > listRows
			? { total: model.chapters.length, offset: win.start, visible: listRows }
			: undefined;

		const rightPanel = renderPanel(chapterContent, {
			title: chapterTitle,
			active: true,
			width: layout.rightWidth,
			height: layout.panelHeight,
			scroll: scrollInfo,
		});

		lines.push(...sideBySide(leftPanel, rightPanel));
	}

	// Fill
	const usedRows = lines.length + 1;
	const remaining = rows - usedRows;
	for (let i = 0; i < remaining; i++) {
		lines.push('');
	}

	// Build status bar hints from manifest actions
	const hints: string[] = ['\u2191\u2193 navigate', 'Enter read'];
	for (const action of model.actions) {
		if (action.shortcut) hints.push(`${action.shortcut} ${action.label.toLowerCase()}`);
	}
	hints.push('s sort', 'q back');
	lines.push(statusBar(hints, cols));

	return lines.join('\n');
}

function buildInfoPanel(model: DetailModel, width: number): string[] {
	const work = model.work;
	if (!work) return [];

	const lines: string[] = [];

	// Author
	if (work.author) {
		lines.push('');
		lines.push(truncAnsi(colors.frost(work.author), width));
	}

	// Status
	if (work.status) {
		lines.push(truncAnsi(colors.dim(work.status), width));
	}

	lines.push('');

	// Genres
	if (work.genres && work.genres.length > 0) {
		const genreStr = work.genres.slice(0, 8).join(', ');
		const wrapped = wrapText(genreStr, width, colors.dim);
		lines.push(...wrapped);
	}

	// Description
	if (work.description) {
		lines.push('');
		const sep = colors.dimmer('\u2500'.repeat(Math.min(width, 20)));
		lines.push(sep);
		lines.push('');

		const clean = work.description
			.replace(/<[^>]*>/g, '')
			.replace(/\s+/g, ' ')
			.trim();
		if (clean) {
			const wrapped = wrapText(clean, width, colors.dim);
			lines.push(...wrapped);
		}
	}

	// Library status
	lines.push('');
	const libLabel = model.inLibrary ? colors.success('\u2713 Library') : colors.dim('+ Library');
	lines.push(libLabel);

	return lines;
}

function viewCollectionsOverlay(model: DetailModel, cols: number, rows: number): string {
	const lines: string[] = [];
	const panelTitle = `${icons.folder} Collections`;
	const panelH = rows - 1;
	const innerW = cols - 2;
	const content: string[] = [];

	if (model.allCollections.length === 0) {
		content.push('');
		content.push(colors.dim(' No collections. Create collections in Settings.'));
	} else {
		const listRows = panelH - 2;
		const win = listWindow(model.allCollections.length, model.collectionSelected, listRows);

		for (const idx of win.visibleItems) {
			const col = model.allCollections[idx];
			const selected = idx === model.collectionSelected;
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

	const panel = renderPanel(content, {
		title: panelTitle,
		active: true,
		width: cols,
		height: panelH,
	});
	lines.push(...panel);

	// Fill
	const usedRows = lines.length + 1;
	const remaining = rows - usedRows;
	for (let i = 0; i < remaining; i++) {
		lines.push('');
	}

	lines.push(statusBar([
		'\u2191\u2193 navigate',
		'Enter/Space toggle',
		'Esc close',
	], cols));

	return lines.join('\n');
}

function viewLibraryOverlay(model: DetailModel, cols: number, rows: number): string {
	const lines: string[] = [];
	const panelTitle = `${icons.library} Add to Library`;
	const panelH = rows - 1;
	const innerW = cols - 2;
	const content: string[] = [];

	if (model.userLibraries.length === 0) {
		content.push('');
		content.push(colors.dim(' No libraries. Create libraries in Settings.'));
	} else {
		const listRows = panelH - 2;
		const win = listWindow(model.userLibraries.length, model.librarySelected, listRows);

		for (const idx of win.visibleItems) {
			const lib = model.userLibraries[idx];
			const selected = idx === model.librarySelected;

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

	const panel = renderPanel(content, {
		title: panelTitle,
		active: true,
		width: cols,
		height: panelH,
	});
	lines.push(...panel);

	// Fill
	const usedRows = lines.length + 1;
	const remaining = rows - usedRows;
	for (let i = 0; i < remaining; i++) {
		lines.push('');
	}

	lines.push(statusBar([
		'\u2191\u2193 navigate',
		'Enter select',
		'Esc cancel',
	], cols));

	return lines.join('\n');
}

// ── Column Renderers ──

export type DetailColumnAction =
	| { type: 'reader'; sourceId: string; workId: string; chapterId: string; title: string }
	| { type: 'openLibraryPicker' }
	| { type: 'openCollectionManager' }
	| { type: 'pass' }
	| null;

export function updateInfoColumn(model: DetailModel, key: KeyMsg): { model: DetailModel; action: DetailColumnAction; asyncFn?: () => Promise<DetailModel> } {
	switch (key.key) {
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
			return { model, action: { type: 'openLibraryPicker' } };
		}
		case 'c':
			return { model, action: { type: 'openCollectionManager' } };
		default:
			return { model, action: { type: 'pass' } };
	}
}

export function updateChaptersColumn(model: DetailModel, key: KeyMsg): { model: DetailModel; action: DetailColumnAction; asyncFn?: () => Promise<DetailModel> } {
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
		case 'enter': {
			const ch = model.chapters[model.selected];
			if (!ch) return { model, action: null };
			return {
				model,
				action: {
					type: 'reader',
					sourceId: model.sourceId,
					workId: model.workId,
					chapterId: ch.id,
					title: ch.title,
				},
			};
		}
		case 'm': {
			const ch = model.chapters[model.selected];
			if (!ch) return { model, action: null };
			const isRead = model.progress.has(ch.id);
			return {
				model,
				action: null,
				asyncFn: async () => {
					await api.markChapter(model.sourceId, model.workId, ch.id, !isRead);
					return load(model);
				},
			};
		}
		case 's': {
			const newSortDesc = !model.sortDesc;
			const chapters = [...model.chapters].reverse();
			return {
				model: { ...model, sortDesc: newSortDesc, chapters, selected: 0 },
				action: null,
			};
		}
		default:
			return { model, action: { type: 'pass' } };
	}
}

/** Render work info as a single column panel. */
export function viewInfoColumn(model: DetailModel, width: number, height: number, focused: boolean): string[] {
	const title = model.work?.title ?? model.initialTitle;

	if (model.loading) {
		return renderPanel([loadingLine()], { title: `${icons.info} ${truncate(title, width - 8)}`, active: focused, width, height });
	}
	if (model.error) {
		return renderPanel([colors.error(model.error)], { title: `${icons.info} ${truncate(title, width - 8)}`, active: focused, width, height });
	}

	const infoContent = buildInfoPanel(model, width - 3);
	return renderPanel(infoContent, { title: `${icons.info} ${truncate(title, width - 8)}`, active: focused, width, height });
}

/** Render chapter list as a single column panel. */
export function viewChaptersColumn(model: DetailModel, width: number, height: number, focused: boolean): string[] {
	const readCount = model.chapters.filter(c => isChapterRead(model.progress, c.id)).length;
	let chapterTitle = `${icons.list} Chapters (${model.chapters.length})`;
	if (readCount > 0) chapterTitle += ` \u2500 ${readCount} read`;

	if (model.loading) {
		return renderPanel([loadingLine()], { title: chapterTitle, active: focused, width, height });
	}

	const listRows = height - 2;
	const chapterContent = buildChapterList(model, listRows, width - 2);

	const win = listWindow(model.chapters.length, model.selected, listRows);
	const scrollInfo = model.chapters.length > listRows
		? { total: model.chapters.length, offset: win.start, visible: listRows }
		: undefined;

	return renderPanel(chapterContent, { title: chapterTitle, active: focused, width, height, scroll: scrollInfo });
}

function buildChapterList(model: DetailModel, maxRows: number, innerW: number): string[] {
	if (model.chapters.length === 0) {
		return ['', colors.dim(' No chapters available.')];
	}

	const win = listWindow(model.chapters.length, model.selected, maxRows);
	const content: string[] = [];

	for (const idx of win.visibleItems) {
		const ch = model.chapters[idx];
		const selected = idx === model.selected;
		const read = isChapterRead(model.progress, ch.id);
		const inProgress = isChapterInProgress(model.progress, ch.id);
		const prog = model.progress.get(ch.id);

		let readIndicator: string;
		let indicatorLen: number;
		if (read) {
			readIndicator = colors.success(' \u2713');
			indicatorLen = 2;
		} else if (inProgress && prog) {
			const progText = ` ${progressBar(prog.page, prog.totalPages, 6)} ${prog.page + 1}/${prog.totalPages}`;
			readIndicator = progText;
			indicatorLen = 8 + `${prog.page + 1}/${prog.totalPages}`.length + 1;
		} else {
			readIndicator = colors.warning(' \u25cf');
			indicatorLen = 2;
		}

		const titleWidth = Math.max(1, innerW - 3 - indicatorLen);
		const chTitle = truncate(ch.title, titleWidth);

		const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
		const titleStr = selected ? colors.selected(chTitle) : (read ? colors.dim(chTitle) : colors.snow(chTitle));
		const line = `${prefix}${titleStr}${readIndicator}`;

		if (selected) {
			content.push(colors.selBg(padAnsi(line, innerW)));
		} else {
			content.push(line);
		}
	}

	return content;
}
