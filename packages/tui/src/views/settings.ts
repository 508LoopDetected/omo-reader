/**
 * Settings view — multi-section management hub driven by manifest.
 *
 * Two-level navigation:
 * 1. Section list — app settings + management sections
 * 2. Section detail — items, create forms, actions
 */

import * as api from '../api.js';
import { colors, statusBar, listWindow, truncate, stripAnsi } from '../ui.js';
import { renderPanel, padAnsi, icons } from '../layout.js';
import type { Msg, KeyMsg } from '../tea.js';
import type { AppManifest, SettingDef, ManagementSection, ManagementActionDef, FieldDef } from '../manifest.js';
import { getTuiSettingCategories, getTuiManagementSections } from '../manifest.js';

// ── Flat setting item (for app settings section) ──

interface FlatSetting {
	setting: SettingDef;
	categoryLabel: string;
}

// ── Section entry in the top-level list ──

interface SectionEntry {
	id: string;
	label: string;
	icon: string;
	kind: 'appSettings' | 'management';
}

// ── Model ──

export interface SettingsModel {
	// Section list
	sections: SectionEntry[];
	selectedSection: number;
	mode: 'sections' | 'appSettings' | 'items' | 'create' | 'confirm';

	// App settings data
	appSettingItems: FlatSetting[];
	appSettingValues: Record<string, string>;
	selectedAppSetting: number;

	// Management section data
	managementSections: ManagementSection[];
	currentManagement: ManagementSection | null;

	// Item list state
	selectedItem: number;

	// Create form state
	formFields: { key: string; value: string; cursorPos: number; fieldDef: FieldDef }[];
	activeField: number;

	// Confirmation state
	confirmAction: ManagementActionDef | null;
	confirmMessage: string | null;

	// General
	loading: boolean;
	error: string | null;
	saving: boolean;
	statusMessage: string | null;
}

// ── Icon map ──

const SECTION_ICONS: Record<string, string> = {
	appSettings: icons.info,
	library: icons.library,
	folder: icons.folder,
	network: icons.network,
	puzzle: icons.puzzle,
	info: icons.info,
};

// ── Init ──

export function init(manifest?: AppManifest | null): SettingsModel {
	const appSettingItems: FlatSetting[] = [];
	const appSettingValues: Record<string, string> = {};
	const sections: SectionEntry[] = [];
	let managementSections: ManagementSection[] = [];

	if (manifest) {
		// App settings
		const categories = getTuiSettingCategories(manifest);
		for (const cat of categories) {
			for (const s of cat.settings) {
				appSettingItems.push({ setting: s, categoryLabel: cat.label });
			}
		}
		Object.assign(appSettingValues, manifest.settings.values);

		// Build section list
		sections.push({ id: 'appSettings', label: 'App Settings', icon: 'info', kind: 'appSettings' });

		managementSections = getTuiManagementSections(manifest);
		for (const ms of managementSections) {
			sections.push({ id: ms.id, label: ms.label, icon: ms.icon, kind: 'management' });
		}
	}

	return {
		sections,
		selectedSection: 0,
		mode: 'sections',
		appSettingItems,
		appSettingValues,
		selectedAppSetting: 0,
		managementSections,
		currentManagement: null,
		selectedItem: 0,
		formFields: [],
		activeField: 0,
		confirmAction: null,
		confirmMessage: null,
		loading: false,
		error: null,
		saving: false,
		statusMessage: null,
	};
}

// ── Load ──

export async function load(model: SettingsModel): Promise<SettingsModel> {
	try {
		const current = await api.getAppSettings();
		const values = { ...model.appSettingValues, ...current };
		return { ...model, appSettingValues: values, loading: false, error: null };
	} catch (err) {
		return { ...model, loading: false, error: String(err) };
	}
}

// ── Actions ──

export type SettingsAction =
	| { type: 'back' }
	| { type: 'refreshManifest' }
	| null;

// ── Update ──

export function update(model: SettingsModel, msg: Msg): { model: SettingsModel; action: SettingsAction; asyncFn?: () => Promise<SettingsModel> } {
	if (msg.type !== 'key') return { model, action: null };
	const key = msg as KeyMsg;

	switch (model.mode) {
		case 'sections':
			return updateSections(model, key);
		case 'appSettings':
			return updateAppSettings(model, key);
		case 'items':
			return updateItems(model, key);
		case 'create':
			return updateCreate(model, key);
		case 'confirm':
			return updateConfirm(model, key);
		default:
			return { model, action: null };
	}
}

// ── Section list navigation ──

function updateSections(model: SettingsModel, key: KeyMsg): { model: SettingsModel; action: SettingsAction; asyncFn?: () => Promise<SettingsModel> } {
	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selectedSection: Math.min(model.selectedSection + 1, Math.max(0, model.sections.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selectedSection: Math.max(model.selectedSection - 1, 0) },
				action: null,
			};
		case 'enter': {
			const section = model.sections[model.selectedSection];
			if (!section) return { model, action: null };
			if (section.kind === 'appSettings') {
				return {
					model: { ...model, mode: 'appSettings', selectedAppSetting: 0 },
					action: null,
				};
			}
			// Management section
			const ms = model.managementSections.find(s => s.id === section.id) ?? null;
			return {
				model: { ...model, mode: 'items', currentManagement: ms, selectedItem: 0, statusMessage: null },
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

// ── App settings cycling ──

function updateAppSettings(model: SettingsModel, key: KeyMsg): { model: SettingsModel; action: SettingsAction; asyncFn?: () => Promise<SettingsModel> } {
	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selectedAppSetting: Math.min(model.selectedAppSetting + 1, Math.max(0, model.appSettingItems.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selectedAppSetting: Math.max(model.selectedAppSetting - 1, 0) },
				action: null,
			};
		case 'enter':
		case 'l':
		case 'right': {
			const item = model.appSettingItems[model.selectedAppSetting];
			if (!item?.setting.options?.length) return { model, action: null };
			const opts = item.setting.options;
			const current = model.appSettingValues[item.setting.key] ?? item.setting.defaultValue;
			const idx = opts.findIndex(o => o.value === current);
			const next = opts[(idx + 1) % opts.length].value;
			const newValues = { ...model.appSettingValues, [item.setting.key]: next };
			return {
				model: { ...model, appSettingValues: newValues, saving: true },
				action: null,
				asyncFn: async () => {
					await api.saveAppSettings({ [item.setting.key]: next });
					return { ...model, appSettingValues: newValues, saving: false };
				},
			};
		}
		case 'h':
		case 'left': {
			const item = model.appSettingItems[model.selectedAppSetting];
			if (!item?.setting.options?.length) return { model, action: null };
			const opts = item.setting.options;
			const current = model.appSettingValues[item.setting.key] ?? item.setting.defaultValue;
			const idx = opts.findIndex(o => o.value === current);
			const prev = opts[(idx - 1 + opts.length) % opts.length].value;
			const newValues = { ...model.appSettingValues, [item.setting.key]: prev };
			return {
				model: { ...model, appSettingValues: newValues, saving: true },
				action: null,
				asyncFn: async () => {
					await api.saveAppSettings({ [item.setting.key]: prev });
					return { ...model, appSettingValues: newValues, saving: false };
				},
			};
		}
		case 'q':
		case 'escape':
			return {
				model: { ...model, mode: 'sections' },
				action: null,
			};
		default:
			return { model, action: null };
	}
}

// ── Item list (management section detail) ──

function updateItems(model: SettingsModel, key: KeyMsg): { model: SettingsModel; action: SettingsAction; asyncFn?: () => Promise<SettingsModel> } {
	const ms = model.currentManagement;
	if (!ms) return { model: { ...model, mode: 'sections' }, action: null };

	const itemCount = ms.items.length;
	// Actions count after items
	const actionCount = (ms.actions ?? []).length;
	const totalRows = itemCount + actionCount;

	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selectedItem: Math.min(model.selectedItem + 1, Math.max(0, totalRows - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selectedItem: Math.max(model.selectedItem - 1, 0) },
				action: null,
			};
		case 'n': {
			// Create new item
			if (!ms.createFields || ms.createFields.length === 0) return { model, action: null };
			const formFields = ms.createFields.map(f => ({
				key: f.key,
				value: f.defaultValue ?? '',
				cursorPos: 0,
				fieldDef: f,
			}));
			return {
				model: { ...model, mode: 'create', formFields, activeField: 0, statusMessage: null },
				action: null,
			};
		}
		case 'd': {
			// Delete selected item
			if (model.selectedItem >= itemCount) return { model, action: null };
			if (!ms.endpoints.delete) return { model, action: null };
			const item = ms.items[model.selectedItem];
			if (!item) return { model, action: null };
			const itemId = String(item.id ?? '');

			if (ms.deleteConfirmation) {
				return {
					model: {
						...model,
						mode: 'confirm',
						confirmAction: { key: 'delete', label: 'Delete', endpoint: ms.endpoints.delete, method: 'DELETE' },
						confirmMessage: ms.deleteConfirmation,
					},
					action: null,
				};
			}

			return {
				model: { ...model, loading: true },
				action: null,
				asyncFn: async () => {
					await api.deleteLocalPath(itemId); // generic delete via fetch
					return { ...model, loading: false, statusMessage: 'Deleted' };
				},
			};
		}
		case 'enter': {
			// If on an action row, execute it
			if (model.selectedItem >= itemCount && actionCount > 0) {
				const actionIdx = model.selectedItem - itemCount;
				const action = (ms.actions ?? [])[actionIdx];
				if (!action) return { model, action: null };

				if (action.confirmation || action.dangerous) {
					return {
						model: {
							...model,
							mode: 'confirm',
							confirmAction: action,
							confirmMessage: action.confirmation ?? `Execute ${action.label}?`,
						},
						action: null,
					};
				}

				return {
					model: { ...model, loading: true },
					action: null,
					asyncFn: async () => {
						await executeAction(action);
						return { ...model, loading: false, statusMessage: `${action.label}: done` };
					},
				};
			}
			return { model, action: null };
		}
		case 'q':
		case 'escape':
			return {
				model: { ...model, mode: 'sections', currentManagement: null, statusMessage: null },
				action: null,
			};
		default:
			return { model, action: null };
	}
}

// ── Create form ──

function updateCreate(model: SettingsModel, key: KeyMsg): { model: SettingsModel; action: SettingsAction; asyncFn?: () => Promise<SettingsModel> } {
	const fields = model.formFields;
	const active = fields[model.activeField];
	if (!active) return { model: { ...model, mode: 'items' }, action: null };

	// Tab / Shift-Tab to move between fields
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
			return { model: { ...model, formFields: newFields }, action: null };
		}
	}

	switch (key.key) {
		case 'escape':
			return {
				model: { ...model, mode: 'items', formFields: [], activeField: 0 },
				action: null,
			};
		case 'enter': {
			// Submit if on last field or explicit submit
			const ms = model.currentManagement;
			if (!ms?.endpoints.create) return { model, action: null };

			// Check required fields
			const allValid = fields.every(f => !f.fieldDef.required || f.value.trim() !== '');
			if (!allValid) return { model, action: null };

			const body: Record<string, string> = {};
			for (const f of fields) {
				body[f.key] = f.value.trim();
			}

			return {
				model: { ...model, loading: true },
				action: null,
				asyncFn: async () => {
					try {
						const url = new URL(ms.endpoints.create!, api.getBaseUrl());
						const res = await fetch(url.toString(), {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(body),
						});
						if (!res.ok) {
							const err = await res.json().catch(() => ({ message: 'Failed' }));
							return { ...model, loading: false, statusMessage: `Error: ${err.message ?? 'Failed'}`, mode: 'items' as const };
						}
						return { ...model, loading: false, mode: 'items' as const, formFields: [], activeField: 0, statusMessage: 'Created successfully' };
					} catch (err) {
						return { ...model, loading: false, statusMessage: `Error: ${err}`, mode: 'items' as const };
					}
				},
			};
		}
		default: {
			// Text input for non-select fields
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
			return { model: { ...model, formFields: newFields }, action: null };
		}
	}
}

// ── Confirm dialog ──

function updateConfirm(model: SettingsModel, key: KeyMsg): { model: SettingsModel; action: SettingsAction; asyncFn?: () => Promise<SettingsModel> } {
	switch (key.key) {
		case 'y':
		case 'enter': {
			const action = model.confirmAction;
			if (!action) return { model: { ...model, mode: 'items', confirmAction: null, confirmMessage: null }, action: null };

			// Special: delete item
			if (action.key === 'delete') {
				const ms = model.currentManagement;
				if (!ms) return { model: { ...model, mode: 'items' }, action: null };
				const item = ms.items[model.selectedItem];
				if (!item) return { model: { ...model, mode: 'items' }, action: null };
				const itemId = String(item.id ?? '');

				return {
					model: { ...model, loading: true },
					action: null,
					asyncFn: async () => {
						try {
							const url = new URL(`${ms.endpoints.delete}?id=${encodeURIComponent(itemId)}`, api.getBaseUrl());
							await fetch(url.toString(), { method: 'DELETE' });
							return { ...model, loading: false, mode: 'items' as const, confirmAction: null, confirmMessage: null, statusMessage: 'Deleted' };
						} catch {
							return { ...model, loading: false, mode: 'items' as const, confirmAction: null, confirmMessage: null, statusMessage: 'Delete failed' };
						}
					},
				};
			}

			// Execute action
			return {
				model: { ...model, loading: true },
				action: null,
				asyncFn: async () => {
					try {
						await executeAction(action);
						return { ...model, loading: false, mode: 'items' as const, confirmAction: null, confirmMessage: null, statusMessage: `${action.label}: done` };
					} catch {
						return { ...model, loading: false, mode: 'items' as const, confirmAction: null, confirmMessage: null, statusMessage: `${action.label}: failed` };
					}
				},
			};
		}
		case 'n':
		case 'escape':
			return {
				model: { ...model, mode: 'items', confirmAction: null, confirmMessage: null },
				action: null,
			};
		default:
			return { model, action: null };
	}
}

// ── Execute action helper ──

async function executeAction(action: ManagementActionDef): Promise<void> {
	const method = action.method ?? 'POST';
	const url = new URL(action.endpoint, api.getBaseUrl());
	await fetch(url.toString(), { method });
}

// ── View ──

export function view(model: SettingsModel, cols: number, rows: number): string {
	switch (model.mode) {
		case 'sections':
			return viewSections(model, cols, rows);
		case 'appSettings':
			return viewAppSettings(model, cols, rows);
		case 'items':
		case 'create':
		case 'confirm':
			return viewManagementSection(model, cols, rows);
		default:
			return '';
	}
}

// ── View: Section List ──

function viewSections(model: SettingsModel, cols: number, rows: number): string {
	const lines: string[] = [];
	const panelTitle = `${icons.info} Settings`;

	if (model.sections.length === 0) {
		const content = ['', colors.dim(' No settings available.')];
		const panel = renderPanel(content, { title: panelTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else {
		const panelH = rows - 1;
		const listRows = panelH - 2;
		const innerW = cols - 2;
		const win = listWindow(model.sections.length, model.selectedSection, listRows);
		const content: string[] = [];

		for (const idx of win.visibleItems) {
			const section = model.sections[idx];
			const selected = idx === model.selectedSection;
			const icon = SECTION_ICONS[section.icon] ?? icons.info;

			const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
			const iconStr = selected ? colors.accent(icon) : colors.dim(icon);
			const label = selected ? colors.selected(section.label) : colors.snow(section.label);
			const line = `${prefix}${iconStr} ${label}`;

			if (selected) {
				content.push(colors.selBg(padAnsi(line, innerW)));
			} else {
				content.push(line);
			}
		}

		const scrollInfo = model.sections.length > listRows
			? { total: model.sections.length, offset: win.start, visible: listRows }
			: undefined;

		const panel = renderPanel(content, {
			title: panelTitle,
			active: true,
			width: cols,
			height: panelH,
			scroll: scrollInfo,
		});
		lines.push(...panel);
	}

	fillRemaining(lines, rows);
	lines.push(statusBar([
		'\u2191\u2193 navigate',
		'Enter open',
		'q back',
	], cols));
	return lines.join('\n');
}

// ── View: App Settings ──

function viewAppSettings(model: SettingsModel, cols: number, rows: number): string {
	const lines: string[] = [];
	const panelTitle = `${icons.info} App Settings`;

	if (model.appSettingItems.length === 0) {
		const content = ['', colors.dim(' No settings available.')];
		const panel = renderPanel(content, { title: panelTitle, active: true, width: cols, height: rows - 1 });
		lines.push(...panel);
	} else {
		const panelH = rows - 1;
		const listRows = panelH - 2;
		const innerW = cols - 2;
		const win = listWindow(model.appSettingItems.length, model.selectedAppSetting, listRows);
		const content: string[] = [];

		let lastCategory = '';
		for (const idx of win.visibleItems) {
			const item = model.appSettingItems[idx];
			const selected = idx === model.selectedAppSetting;

			if (item.categoryLabel !== lastCategory) {
				if (lastCategory !== '') content.push('');
				content.push(colors.frost(` ${item.categoryLabel}`));
				lastCategory = item.categoryLabel;
			}

			const currentValue = model.appSettingValues[item.setting.key] ?? item.setting.defaultValue;
			const valueLabel = item.setting.options?.find(o => o.value === currentValue)?.label ?? currentValue;

			const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
			const label = selected ? colors.selected(item.setting.label) : colors.snow(item.setting.label);
			const value = selected ? colors.accent(`\u25c0 ${valueLabel} \u25b6`) : colors.dim(valueLabel);

			const labelWidth = stripAnsi(`${prefix}${item.setting.label}`).length;
			const valueWidth = stripAnsi(value).length;
			const gap = Math.max(1, innerW - labelWidth - valueWidth - 1);
			const line = `${prefix}${label}${' '.repeat(gap)}${value}`;

			if (selected) {
				content.push(colors.selBg(padAnsi(line, innerW)));
			} else {
				content.push(line);
			}
		}

		const scrollInfo = model.appSettingItems.length > listRows
			? { total: model.appSettingItems.length, offset: win.start, visible: listRows }
			: undefined;

		const panel = renderPanel(content, {
			title: panelTitle,
			active: true,
			width: cols,
			height: panelH,
			scroll: scrollInfo,
		});
		lines.push(...panel);
	}

	fillRemaining(lines, rows);
	lines.push(statusBar([
		'\u2191\u2193 navigate',
		'\u2190\u2192 change',
		'Esc back',
	], cols));
	return lines.join('\n');
}

// ── View: Management Section Detail ──

function viewManagementSection(model: SettingsModel, cols: number, rows: number): string {
	const ms = model.currentManagement;
	if (!ms) return viewSections(model, cols, rows);

	const lines: string[] = [];
	const sIcon = SECTION_ICONS[ms.icon] ?? icons.info;
	const panelTitle = `${sIcon} ${ms.label}`;

	// Confirm overlay
	if (model.mode === 'confirm' && model.confirmMessage) {
		return viewConfirm(model, cols, rows, panelTitle);
	}

	// Create form overlay
	if (model.mode === 'create') {
		return viewCreateForm(model, cols, rows, panelTitle);
	}

	// Item list + actions
	const panelH = rows - 1;
	const innerW = cols - 2;
	const content: string[] = [];

	// Description
	if (ms.description) {
		content.push(colors.dim(` ${ms.description}`));
		content.push('');
	}

	// Stats (for cache)
	if (ms.stats && ms.stats.totalSize !== undefined) {
		const size = formatBytes(ms.stats.totalSize as number);
		const count = ms.stats.totalCount as number;
		content.push(colors.snow(` Cache: ${size} (${count} thumbnails)`));
		content.push('');
	}

	// Status message
	if (model.statusMessage) {
		content.push(colors.success(` ${model.statusMessage}`));
		content.push('');
	}

	const itemCount = ms.items.length;
	const actionCount = (ms.actions ?? []).length;
	const totalRows = itemCount + actionCount;

	if (totalRows === 0 && !ms.createFields) {
		content.push(colors.dim(' No items.'));
	} else {
		// Items
		if (ms.itemFields && ms.itemFields.length > 0) {
			for (let i = 0; i < itemCount; i++) {
				const item = ms.items[i];
				const selected = model.selectedItem === i;
				const prefix = selected ? colors.accent(' \u25b8 ') : '   ';

				// Build display: primary field + secondary
				const primaryField = ms.itemFields[0];
				const primaryVal = String(item[primaryField.key] ?? '');
				const secondaryParts: string[] = [];
				for (let fi = 1; fi < ms.itemFields.length; fi++) {
					const f = ms.itemFields[fi];
					const v = item[f.key];
					if (v != null && String(v) !== '') {
						if (f.options) {
							const opt = f.options.find(o => o.value === String(v));
							secondaryParts.push(opt?.label ?? String(v));
						} else {
							secondaryParts.push(String(v));
						}
					}
				}

				const titleStr = selected ? colors.selected(truncate(primaryVal, innerW - 20)) : colors.snow(truncate(primaryVal, innerW - 20));
				const meta = secondaryParts.length > 0 ? colors.dim(` [${secondaryParts.join(', ')}]`) : '';
				const line = `${prefix}${titleStr}${meta}`;

				if (selected) {
					content.push(colors.selBg(padAnsi(line, innerW)));
				} else {
					content.push(line);
				}
			}
		} else if (itemCount === 0 && ms.id === 'repos') {
			content.push(colors.dim(' No custom repos. Using default: kodjodevf/mangayomi-extensions'));
			content.push('');
		}

		// Actions
		if (actionCount > 0) {
			if (itemCount > 0) content.push('');
			for (let i = 0; i < actionCount; i++) {
				const action = (ms.actions ?? [])[i];
				const idx = itemCount + i;
				const selected = model.selectedItem === idx;
				const prefix = selected ? colors.accent(' \u25b8 ') : '   ';

				const labelColor = action.dangerous
					? (selected ? colors.error : colors.error)
					: (selected ? colors.selected : colors.warning);
				const line = `${prefix}${labelColor(action.label)}`;

				if (selected) {
					content.push(colors.selBg(padAnsi(line, innerW)));
				} else {
					content.push(line);
				}
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

	fillRemaining(lines, rows);

	const hints: string[] = ['\u2191\u2193 navigate'];
	if (ms.createFields && ms.createFields.length > 0) hints.push('n new');
	if (ms.endpoints.delete && itemCount > 0) hints.push('d delete');
	if (actionCount > 0) hints.push('Enter action');
	hints.push('Esc back');
	lines.push(statusBar(hints, cols));

	return lines.join('\n');
}

// ── View: Create Form ──

function viewCreateForm(model: SettingsModel, cols: number, rows: number, panelTitle: string): string {
	const lines: string[] = [];
	const panelH = rows - 1;
	const innerW = cols - 2;
	const content: string[] = [];

	content.push(colors.frost(' Create New'));
	content.push('');

	for (let i = 0; i < model.formFields.length; i++) {
		const f = model.formFields[i];
		const active = i === model.activeField;
		const labelColor = active ? colors.accent : colors.dim;
		const required = f.fieldDef.required ? ' *' : '';

		content.push(labelColor(` ${f.fieldDef.label}${required}`));

		if (f.fieldDef.type === 'select' && f.fieldDef.options) {
			const currentVal = f.value || f.fieldDef.defaultValue || '';
			const opt = f.fieldDef.options.find(o => o.value === currentVal);
			const label = opt?.label ?? currentVal;
			if (active) {
				content.push(colors.accent(`   \u25c0 ${label} \u25b6`));
			} else {
				content.push(colors.snow(`   ${label}`));
			}
		} else {
			const displayVal = f.fieldDef.type === 'password' ? '\u2022'.repeat(f.value.length) : f.value;
			if (active) {
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

	const panel = renderPanel(content, {
		title: `${panelTitle} \u2500 New`,
		active: true,
		width: cols,
		height: panelH,
	});
	lines.push(...panel);

	fillRemaining(lines, rows);
	lines.push(statusBar([
		'Tab next field',
		'\u2190\u2192 select options',
		'Enter submit',
		'Esc cancel',
	], cols));
	return lines.join('\n');
}

// ── View: Confirm Dialog ──

function viewConfirm(model: SettingsModel, cols: number, rows: number, panelTitle: string): string {
	const lines: string[] = [];
	const panelH = rows - 1;
	const content: string[] = [];

	content.push('');
	content.push(colors.warning(' Confirm'));
	content.push('');

	const msg = model.confirmMessage ?? 'Are you sure?';
	// Wrap long messages
	const msgLines = msg.split('\n');
	for (const ml of msgLines) {
		content.push(` ${ml.trim() ? colors.snow(ml.trim()) : ''}`);
	}
	content.push('');
	content.push(colors.accent(' [y] Yes   [n/Esc] Cancel'));

	const panel = renderPanel(content, {
		title: panelTitle,
		active: true,
		width: cols,
		height: panelH,
	});
	lines.push(...panel);

	fillRemaining(lines, rows);
	lines.push(statusBar(['y confirm', 'n/Esc cancel'], cols));
	return lines.join('\n');
}

// ── Helpers ──

function fillRemaining(lines: string[], rows: number): void {
	const usedRows = lines.length + 1;
	const remaining = rows - usedRows;
	for (let i = 0; i < remaining; i++) {
		lines.push('');
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Column Renderers ──

export type SettingsColumnAction =
	| { type: 'openConfirm'; message: string; action: ManagementActionDef; itemId?: string }
	| { type: 'openCreateForm'; fields: FieldDef[]; endpoint: string; title: string }
	| { type: 'pass' }
	| null;

export function updateSectionsColumn(model: SettingsModel, key: KeyMsg): { model: SettingsModel; action: SettingsColumnAction } {
	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selectedSection: Math.min(model.selectedSection + 1, Math.max(0, model.sections.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selectedSection: Math.max(model.selectedSection - 1, 0) },
				action: null,
			};
		case 'enter':
		case 'l':
		case 'right': {
			const section = model.sections[model.selectedSection];
			if (!section) return { model, action: null };
			if (section.kind === 'appSettings') {
				return { model: { ...model, mode: 'appSettings', selectedAppSetting: 0 }, action: null };
			}
			const ms = model.managementSections.find(s => s.id === section.id) ?? null;
			return { model: { ...model, mode: 'items', currentManagement: ms, selectedItem: 0, statusMessage: null }, action: null };
		}
		default:
			return { model, action: { type: 'pass' } };
	}
}

export function updateDetailColumn(model: SettingsModel, key: KeyMsg): { model: SettingsModel; action: SettingsColumnAction; asyncFn?: () => Promise<SettingsModel> } {
	const section = model.sections[model.selectedSection];
	if (!section) return { model, action: { type: 'pass' } };

	if (section.kind === 'appSettings') {
		return updateAppSettingsColumn(model, key);
	}

	return updateItemsColumn(model, key);
}

function updateAppSettingsColumn(model: SettingsModel, key: KeyMsg): { model: SettingsModel; action: SettingsColumnAction; asyncFn?: () => Promise<SettingsModel> } {
	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selectedAppSetting: Math.min(model.selectedAppSetting + 1, Math.max(0, model.appSettingItems.length - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selectedAppSetting: Math.max(model.selectedAppSetting - 1, 0) },
				action: null,
			};
		case 'enter':
		case 'l':
		case 'right': {
			const item = model.appSettingItems[model.selectedAppSetting];
			if (!item?.setting.options?.length) return { model, action: null };
			const opts = item.setting.options;
			const current = model.appSettingValues[item.setting.key] ?? item.setting.defaultValue;
			const idx = opts.findIndex(o => o.value === current);
			const next = opts[(idx + 1) % opts.length].value;
			const newValues = { ...model.appSettingValues, [item.setting.key]: next };
			return {
				model: { ...model, appSettingValues: newValues, saving: true },
				action: null,
				asyncFn: async () => {
					await api.saveAppSettings({ [item.setting.key]: next });
					return { ...model, appSettingValues: newValues, saving: false };
				},
			};
		}
		case 'h':
		case 'left': {
			const item = model.appSettingItems[model.selectedAppSetting];
			if (!item?.setting.options?.length) return { model, action: null };
			const opts = item.setting.options;
			const current = model.appSettingValues[item.setting.key] ?? item.setting.defaultValue;
			const idx = opts.findIndex(o => o.value === current);
			const prev = opts[(idx - 1 + opts.length) % opts.length].value;
			const newValues = { ...model.appSettingValues, [item.setting.key]: prev };
			return {
				model: { ...model, appSettingValues: newValues, saving: true },
				action: null,
				asyncFn: async () => {
					await api.saveAppSettings({ [item.setting.key]: prev });
					return { ...model, appSettingValues: newValues, saving: false };
				},
			};
		}
		default:
			return { model, action: { type: 'pass' } };
	}
}

function updateItemsColumn(model: SettingsModel, key: KeyMsg): { model: SettingsModel; action: SettingsColumnAction; asyncFn?: () => Promise<SettingsModel> } {
	const ms = model.currentManagement;
	if (!ms) return { model, action: { type: 'pass' } };

	const itemCount = ms.items.length;
	const actionCount = (ms.actions ?? []).length;
	const totalRows = itemCount + actionCount;

	switch (key.key) {
		case 'j':
		case 'down':
			return {
				model: { ...model, selectedItem: Math.min(model.selectedItem + 1, Math.max(0, totalRows - 1)) },
				action: null,
			};
		case 'k':
		case 'up':
			return {
				model: { ...model, selectedItem: Math.max(model.selectedItem - 1, 0) },
				action: null,
			};
		case 'n': {
			if (!ms.createFields || ms.createFields.length === 0) return { model, action: null };
			return {
				model,
				action: { type: 'openCreateForm', fields: ms.createFields, endpoint: ms.endpoints.create!, title: ms.label },
			};
		}
		case 'd': {
			if (model.selectedItem >= itemCount) return { model, action: null };
			if (!ms.endpoints.delete) return { model, action: null };
			const item = ms.items[model.selectedItem];
			if (!item) return { model, action: null };
			const itemId = String(item.id ?? '');

			if (ms.deleteConfirmation) {
				return {
					model,
					action: {
						type: 'openConfirm',
						message: ms.deleteConfirmation,
						action: { key: 'delete', label: 'Delete', endpoint: ms.endpoints.delete, method: 'DELETE' },
						itemId,
					},
				};
			}

			return {
				model: { ...model, loading: true },
				action: null,
				asyncFn: async () => {
					await api.deleteLocalPath(itemId);
					return { ...model, loading: false, statusMessage: 'Deleted' };
				},
			};
		}
		case 'enter': {
			if (model.selectedItem >= itemCount && actionCount > 0) {
				const actionIdx = model.selectedItem - itemCount;
				const action = (ms.actions ?? [])[actionIdx];
				if (!action) return { model, action: null };

				if (action.confirmation || action.dangerous) {
					return {
						model,
						action: {
							type: 'openConfirm',
							message: action.confirmation ?? `Execute ${action.label}?`,
							action,
						},
					};
				}

				return {
					model: { ...model, loading: true },
					action: null,
					asyncFn: async () => {
						await executeAction(action);
						return { ...model, loading: false, statusMessage: `${action.label}: done` };
					},
				};
			}
			return { model, action: null };
		}
		default:
			return { model, action: { type: 'pass' } };
	}
}

/** Render settings section list as a column panel. */
export function viewSectionsColumn(model: SettingsModel, width: number, height: number, focused: boolean): string[] {
	const panelTitle = `${icons.info} Settings`;

	if (model.sections.length === 0) {
		return renderPanel(['', colors.dim(' No settings.')], { title: panelTitle, active: focused, width, height });
	}

	const innerW = width - 2;
	const listRows = height - 2;
	const win = listWindow(model.sections.length, model.selectedSection, listRows);
	const content: string[] = [];

	for (const idx of win.visibleItems) {
		const section = model.sections[idx];
		const selected = idx === model.selectedSection;
		const icon = SECTION_ICONS[section.icon] ?? icons.info;
		const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
		const iconStr = selected ? colors.accent(icon) : colors.dim(icon);
		const label = selected ? colors.selected(section.label) : colors.snow(section.label);
		const line = `${prefix}${iconStr} ${label}`;

		if (selected) {
			content.push(colors.selBg(padAnsi(line, innerW)));
		} else {
			content.push(line);
		}
	}

	return renderPanel(content, { title: panelTitle, active: focused, width, height });
}

/** Render settings detail (app settings or management items) as a column panel. */
export function viewDetailColumn(model: SettingsModel, width: number, height: number, focused: boolean): string[] {
	const section = model.sections[model.selectedSection];
	if (!section) {
		return renderPanel([colors.dim(' Select a section')], { title: `${icons.info} Detail`, active: focused, width, height });
	}

	if (section.kind === 'appSettings') {
		return viewAppSettingsColumn(model, width, height, focused);
	}

	return viewManagementColumn(model, width, height, focused);
}

function viewAppSettingsColumn(model: SettingsModel, width: number, height: number, focused: boolean): string[] {
	const panelTitle = `${icons.info} App Settings`;
	const innerW = width - 2;

	if (model.appSettingItems.length === 0) {
		return renderPanel(['', colors.dim(' No settings.')], { title: panelTitle, active: focused, width, height });
	}

	const listRows = height - 2;
	const win = listWindow(model.appSettingItems.length, model.selectedAppSetting, listRows);
	const content: string[] = [];
	let lastCategory = '';

	for (const idx of win.visibleItems) {
		const item = model.appSettingItems[idx];
		const selected = idx === model.selectedAppSetting;

		if (item.categoryLabel !== lastCategory) {
			if (lastCategory !== '') content.push('');
			content.push(colors.frost(` ${item.categoryLabel}`));
			lastCategory = item.categoryLabel;
		}

		const currentValue = model.appSettingValues[item.setting.key] ?? item.setting.defaultValue;
		const valueLabel = item.setting.options?.find(o => o.value === currentValue)?.label ?? currentValue;
		const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
		const label = selected ? colors.selected(item.setting.label) : colors.snow(item.setting.label);
		const value = selected ? colors.accent(`\u25c0 ${valueLabel} \u25b6`) : colors.dim(valueLabel);

		const labelWidth = stripAnsi(`${prefix}${item.setting.label}`).length;
		const valueWidth = stripAnsi(value).length;
		const gap = Math.max(1, innerW - labelWidth - valueWidth - 1);
		const line = `${prefix}${label}${' '.repeat(gap)}${value}`;

		if (selected) {
			content.push(colors.selBg(padAnsi(line, innerW)));
		} else {
			content.push(line);
		}
	}

	return renderPanel(content, { title: panelTitle, active: focused, width, height });
}

function viewManagementColumn(model: SettingsModel, width: number, height: number, focused: boolean): string[] {
	const ms = model.currentManagement;
	const section = model.sections[model.selectedSection];
	if (!ms || !section) {
		return renderPanel([colors.dim(' Select a section')], { title: 'Detail', active: focused, width, height });
	}

	const sIcon = SECTION_ICONS[ms.icon] ?? icons.info;
	const panelTitle = `${sIcon} ${ms.label}`;
	const innerW = width - 2;
	const content: string[] = [];

	if (ms.description) {
		content.push(colors.dim(` ${ms.description}`));
		content.push('');
	}

	if (ms.stats && ms.stats.totalSize !== undefined) {
		const size = formatBytes(ms.stats.totalSize as number);
		const count = ms.stats.totalCount as number;
		content.push(colors.snow(` Cache: ${size} (${count} thumbnails)`));
		content.push('');
	}

	if (model.statusMessage) {
		content.push(colors.success(` ${model.statusMessage}`));
		content.push('');
	}

	const itemCount = ms.items.length;
	const actionCount = (ms.actions ?? []).length;
	const totalRows = itemCount + actionCount;

	if (totalRows === 0 && !ms.createFields) {
		content.push(colors.dim(' No items.'));
	} else {
		if (ms.itemFields && ms.itemFields.length > 0) {
			for (let i = 0; i < itemCount; i++) {
				const item = ms.items[i];
				const selected = model.selectedItem === i;
				const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
				const primaryField = ms.itemFields[0];
				const primaryVal = String(item[primaryField.key] ?? '');
				const secondaryParts: string[] = [];
				for (let fi = 1; fi < ms.itemFields.length; fi++) {
					const f = ms.itemFields[fi];
					const v = item[f.key];
					if (v != null && String(v) !== '') {
						if (f.options) {
							const opt = f.options.find(o => o.value === String(v));
							secondaryParts.push(opt?.label ?? String(v));
						} else {
							secondaryParts.push(String(v));
						}
					}
				}
				const titleStr = selected ? colors.selected(truncate(primaryVal, innerW - 20)) : colors.snow(truncate(primaryVal, innerW - 20));
				const meta = secondaryParts.length > 0 ? colors.dim(` [${secondaryParts.join(', ')}]`) : '';
				const line = `${prefix}${titleStr}${meta}`;

				if (selected) {
					content.push(colors.selBg(padAnsi(line, innerW)));
				} else {
					content.push(line);
				}
			}
		} else if (itemCount === 0 && ms.id === 'repos') {
			content.push(colors.dim(' No custom repos. Using default.'));
			content.push('');
		}

		if (actionCount > 0) {
			if (itemCount > 0) content.push('');
			for (let i = 0; i < actionCount; i++) {
				const action = (ms.actions ?? [])[i];
				const idx = itemCount + i;
				const selected = model.selectedItem === idx;
				const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
				const labelColor = action.dangerous
					? colors.error
					: (selected ? colors.selected : colors.warning);
				const line = `${prefix}${labelColor(action.label)}`;

				if (selected) {
					content.push(colors.selBg(padAnsi(line, innerW)));
				} else {
					content.push(line);
				}
			}
		}
	}

	return renderPanel(content, { title: panelTitle, active: focused, width, height });
}
