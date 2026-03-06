/**
 * Manifest client for TUI — fetches and caches the app manifest.
 */

import { getAppManifest } from '@omo/core';

export interface ControlDef {
	key: string;
	label: string;
	type: 'select' | 'toggle' | 'cycle' | 'text';
	options?: { value: string; label: string }[];
	defaultValue: string;
	platforms?: ('gui' | 'tui')[];
}

export interface SettingDef extends ControlDef {
	category: string;
	scopes: ('global' | 'library' | 'collection' | 'title')[];
}

export interface NavItemDef {
	id: string;
	label: string;
	icon: string;
	route: string;
	view: string;
	platforms?: ('gui' | 'tui')[];
}

export interface ViewDef {
	id: string;
	controls: ControlDef[];
	actions?: ActionDef[];
}

export interface ActionDef {
	key: string;
	label: string;
	icon?: string;
	shortcut?: string;
	platforms?: ('gui' | 'tui')[];
}

export interface FieldDef {
	key: string;
	label: string;
	type: 'text' | 'password' | 'select' | 'path';
	required?: boolean;
	placeholder?: string;
	options?: { value: string; label: string }[];
	defaultValue?: string;
}

export interface ManagementActionDef {
	key: string;
	label: string;
	endpoint: string;
	method?: string;
	confirmation?: string;
	dangerous?: boolean;
}

export interface ManagementSection {
	id: string;
	label: string;
	icon: string;
	description?: string;
	endpoints: {
		list: string;
		create?: string;
		update?: string;
		delete?: string;
	};
	createFields?: FieldDef[];
	itemFields?: FieldDef[];
	readerOverrides?: boolean;
	deleteConfirmation?: string;
	idField?: string;
	actions?: ManagementActionDef[];
	items: Record<string, unknown>[];
	stats?: Record<string, unknown>;
}

export interface AppManifest {
	nav: {
		static: NavItemDef[];
		libraries: { id: string; label: string; type: string; icon: string; nsfw: boolean }[];
		collections: { id: string; label: string }[];
	};
	views: Record<string, ViewDef>;
	settings: {
		categories: { id: string; label: string; settings: SettingDef[] }[];
		values: Record<string, string>;
	};
	management: ManagementSection[];
}

let cachedManifest: AppManifest | null = null;

export async function getManifest(): Promise<AppManifest> {
	if (cachedManifest) return cachedManifest;
	cachedManifest = await getAppManifest() as AppManifest;
	return cachedManifest;
}

export function getCachedManifest(): AppManifest | null {
	return cachedManifest;
}

export function invalidateCache(): void {
	cachedManifest = null;
}

/** Get nav items filtered for TUI platform */
export function getTuiNavItems(manifest: AppManifest): NavItemDef[] {
	return manifest.nav.static.filter(n => !n.platforms || n.platforms.includes('tui'));
}

/** Get controls for a view, filtered for TUI platform */
export function getTuiControls(manifest: AppManifest, viewId: string): ControlDef[] {
	const view = manifest.views[viewId];
	if (!view) return [];
	return view.controls.filter(c => !c.platforms || c.platforms.includes('tui'));
}

/** Get actions for a view, filtered for TUI platform */
export function getTuiActions(manifest: AppManifest, viewId: string): ActionDef[] {
	const view = manifest.views[viewId];
	if (!view?.actions) return [];
	return view.actions.filter(a => !a.platforms || a.platforms.includes('tui'));
}

/** Get setting categories filtered for TUI platform */
export function getTuiSettingCategories(manifest: AppManifest): { id: string; label: string; settings: SettingDef[] }[] {
	return manifest.settings.categories
		.map(cat => ({
			...cat,
			settings: cat.settings.filter(s => !s.platforms || s.platforms.includes('tui')),
		}))
		.filter(cat => cat.settings.length > 0);
}

/** Get sort options for a view, returning the cycle options */
export function getSortOptions(manifest: AppManifest, viewId: string): { value: string; label: string }[] {
	const controls = getTuiControls(manifest, viewId);
	const sortControl = controls.find(c => c.key === 'sort');
	return sortControl?.options ?? [];
}

/** Cycle to the next value in a control's options */
export function cycleControlValue(control: ControlDef, currentValue: string): string {
	if (!control.options || control.options.length === 0) return currentValue;
	const idx = control.options.findIndex(o => o.value === currentValue);
	return control.options[(idx + 1) % control.options.length].value;
}

/** Get the label for a control value */
export function getControlLabel(control: ControlDef, currentValue: string): string {
	const opt = control.options?.find(o => o.value === currentValue);
	return opt?.label ?? currentValue;
}

/** Get management sections from manifest */
export function getTuiManagementSections(manifest: AppManifest): ManagementSection[] {
	return manifest.management ?? [];
}
