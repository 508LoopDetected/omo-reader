/**
 * OMOCore Config Manifest — Single Source of Truth for App Structure.
 *
 * This file defines EVERYTHING about what the app can do — settings, views,
 * menus, filters, options, navigation. Both GUI and TUI are pure renderers.
 */

import { db } from '../db/client.js';
import { userLibraries, collections, appSettings, localLibraryPaths, smbConnections, extensionRepos } from '../db/schema.js';
import { asc } from 'drizzle-orm';
import { getStats as getThumbStats } from '../thumbnails/thumbnail-cache.js';

// ── Type Definitions ──

/** A user-facing control (sort dropdown, filter toggle, search box, etc.) */
export interface ControlDef {
	key: string;
	label: string;
	type: 'select' | 'toggle' | 'cycle' | 'text';
	options?: { value: string; label: string }[];
	defaultValue: string;
	platforms?: ('gui' | 'tui')[];
}

/** A setting that can be overridden at different scopes */
export interface SettingDef extends ControlDef {
	category: string;
	scopes: ('global' | 'library' | 'collection' | 'title')[];
}

/** Navigation item */
export interface NavItemDef {
	id: string;
	label: string;
	icon: string;
	route: string;
	view: string;
	platforms?: ('gui' | 'tui')[];
}

/** A view's full definition — what controls it has */
export interface ViewDef {
	id: string;
	controls: ControlDef[];
	actions?: ActionDef[];
}

/** An available action in a view */
export interface ActionDef {
	key: string;
	label: string;
	icon?: string;
	shortcut?: string;
	platforms?: ('gui' | 'tui')[];
}

/** A field in a create/edit form */
export interface FieldDef {
	key: string;
	label: string;
	type: 'text' | 'password' | 'select' | 'path';
	required?: boolean;
	placeholder?: string;
	options?: { value: string; label: string }[];
	defaultValue?: string;
}

/** A standalone action (test, clear, reset) */
export interface ManagementActionDef {
	key: string;
	label: string;
	endpoint: string;
	method?: string; // default 'POST'
	confirmation?: string;
	dangerous?: boolean;
}

/** A management section — entity CRUD or action group */
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
	idField?: string; // field name used as item ID (default 'id')

	actions?: ManagementActionDef[];

	items: Record<string, unknown>[];
	stats?: Record<string, unknown>;
}

/** Full app manifest returned by the API */
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

// ── Static Navigation ──

const LIBRARY_TYPE_ICONS: Record<string, string> = {
	manga: 'library-manga',
	western: 'library-western',
	webcomic: 'library-webcomic',
};

export function getStaticNavItems(): NavItemDef[] {
	return [
		{ id: 'home', label: 'Home', icon: 'home', route: '/', view: 'home' },
		{ id: 'library', label: 'My Library', icon: 'library', route: '/library', view: 'library' },
		{ id: 'search', label: 'Search', icon: 'search', route: '/search', view: 'search' },
		{ id: 'sources', label: 'Sources', icon: 'sources', route: '/sources', view: 'sources' },
		{ id: 'extensions', label: 'Extensions', icon: 'extensions', route: '/extensions', view: 'extensions' },
		{ id: 'settings', label: 'Settings', icon: 'settings', route: '/settings', view: 'settings' },
	];
}

// ── View Definitions ──

export function getViewDefs(): Record<string, ViewDef> {
	return {
		library: {
			id: 'library',
			controls: [
				{
					key: 'sort',
					label: 'Sort',
					type: 'cycle',
					options: [
						{ value: 'recent', label: 'Recent' },
						{ value: 'added', label: 'Added' },
						{ value: 'title', label: 'A-Z' },
					],
					defaultValue: 'recent',
				},
			],
		},
		libraryById: {
			id: 'libraryById',
			controls: [
				{
					key: 'sort',
					label: 'Sort',
					type: 'cycle',
					options: [
						{ value: 'recent', label: 'Recent' },
						{ value: 'added', label: 'Added' },
						{ value: 'title', label: 'A-Z' },
					],
					defaultValue: 'recent',
				},
				{
					key: 'viewMode',
					label: 'View',
					type: 'cycle',
					options: [
						{ value: 'all', label: 'All' },
						{ value: 'collection', label: 'By Collection' },
					],
					defaultValue: 'all',
				},
			],
		},
		collection: {
			id: 'collection',
			controls: [
				{
					key: 'sort',
					label: 'Sort',
					type: 'cycle',
					options: [
						{ value: 'title', label: 'A-Z' },
						{ value: 'recent', label: 'Recent' },
						{ value: 'added', label: 'Added' },
					],
					defaultValue: 'title',
				},
			],
		},
		detail: {
			id: 'detail',
			controls: [
				{
					key: 'chapterSort',
					label: 'Chapter Sort',
					type: 'cycle',
					options: [
						{ value: 'desc', label: 'Newest first' },
						{ value: 'asc', label: 'Oldest first' },
					],
					defaultValue: 'desc',
				},
				{
					key: 'chapterView',
					label: 'View',
					type: 'cycle',
					options: [
						{ value: 'list', label: 'List' },
						{ value: 'grid', label: 'Grid' },
					],
					defaultValue: 'list',
					platforms: ['gui'],
				},
			],
			actions: [
				{ key: 'addLibrary', label: 'Add to Library', icon: 'add', shortcut: 'a' },
				{ key: 'manageCollections', label: 'Collections', icon: 'collection', shortcut: 'c' },
				{ key: 'markRead', label: 'Mark Read', icon: 'check', shortcut: 'm' },
				{ key: 'continueReading', label: 'Continue Reading', icon: 'play' },
			],
		},
		browse: {
			id: 'browse',
			controls: [
				{
					key: 'browseMode',
					label: 'Mode',
					type: 'cycle',
					options: [
						{ value: 'popular', label: 'Popular' },
						{ value: 'latest', label: 'Latest' },
					],
					defaultValue: 'popular',
				},
				{
					key: 'search',
					label: 'Search',
					type: 'text',
					defaultValue: '',
				},
			],
		},
		search: {
			id: 'search',
			controls: [],
		},
		settings: {
			id: 'settings',
			controls: [],
		},
	};
}

// ── Setting Definitions ──

export function getSettingDefs(): { id: string; label: string; settings: SettingDef[] }[] {
	return [
		{
			id: 'library',
			label: 'Library',
			settings: [
				{
					key: 'library.collectionDisplay',
					label: 'Collection Display',
					type: 'select',
					category: 'library',
					scopes: ['global'],
					options: [
						{ value: 'grouped', label: 'Show collections in library' },
						{ value: 'inline', label: 'Show alongside individual items' },
						{ value: 'hidden', label: 'Hide collections from library' },
					],
					defaultValue: 'grouped',
				},
			],
		},
		{
			id: 'browse',
			label: 'Browse',
			settings: [
				{
					key: 'browse.nsfwMode',
					label: 'Content Filter',
					type: 'select',
					category: 'browse',
					scopes: ['global'],
					options: [
						{ value: 'sfw', label: 'SFW Only' },
						{ value: 'all', label: 'Show All' },
						{ value: 'nsfw', label: 'NSFW Only' },
					],
					defaultValue: 'sfw',
				},
			],
		},
		{
			id: 'reader',
			label: 'Reader Defaults',
			settings: [
				{
					key: 'reader.mode',
					label: 'Reading Mode',
					type: 'select',
					category: 'reader',
					scopes: ['global'],
					options: [
						{ value: 'spread', label: 'Two-Page Spread' },
						{ value: 'single', label: 'Single Page' },
						{ value: 'vertical', label: 'Vertical Scroll' },
					],
					defaultValue: 'spread',
				},
				{
					key: 'reader.direction',
					label: 'Reading Direction',
					type: 'select',
					category: 'reader',
					scopes: ['global', 'library', 'collection', 'title'],
					options: [
						{ value: 'rtl', label: 'Right to Left (Manga)' },
						{ value: 'ltr', label: 'Left to Right (Western)' },
					],
					defaultValue: 'rtl',
				},
				{
					key: 'reader.offset',
					label: 'Cover Page Offset',
					type: 'select',
					category: 'reader',
					scopes: ['global', 'library', 'collection', 'title'],
					options: [
						{ value: 'true', label: 'On (cover page solo)' },
						{ value: 'false', label: 'Off' },
					],
					defaultValue: 'true',
				},
				{
					key: 'cover.artMode',
					label: 'Chapter Cover Art',
					type: 'select',
					category: 'reader',
					scopes: ['global', 'library', 'collection', 'title'],
					options: [
						{ value: 'auto', label: 'Page 1 (default)' },
						{ value: 'none', label: 'None' },
						{ value: 'offset', label: 'Page 2' },
						{ value: 'offset2', label: 'Page 3' },
					],
					defaultValue: 'auto',
				},
			],
		},
		{
			id: 'ui',
			label: 'Interface',
			settings: [
				{
					key: 'ui.theme',
					label: 'Theme',
					type: 'select',
					category: 'ui',
					scopes: ['global'],
					platforms: ['gui'],
					options: [
						{ value: 'dark', label: 'Dark' },
						{ value: 'light', label: 'Light' },
					],
					defaultValue: 'dark',
				},
				{
					key: 'ui.colorScheme',
					label: 'Color Scheme',
					type: 'select',
					category: 'ui',
					scopes: ['global'],
					platforms: ['gui'],
					options: [
						{ value: 'cerberus', label: 'Cerberus' },
						{ value: 'catppuccin', label: 'Catppuccin' },
						{ value: 'concord', label: 'Concord' },
						{ value: 'crimson', label: 'Crimson' },
						{ value: 'fennec', label: 'Fennec' },
						{ value: 'hamlindigo', label: 'Hamlindigo' },
						{ value: 'legacy', label: 'Legacy' },
						{ value: 'mint', label: 'Mint' },
						{ value: 'modern', label: 'Modern' },
						{ value: 'mona', label: 'Mona' },
						{ value: 'nosh', label: 'Nosh' },
						{ value: 'nouveau', label: 'Nouveau' },
						{ value: 'pine', label: 'Pine' },
						{ value: 'reign', label: 'Reign' },
						{ value: 'rocket', label: 'Rocket' },
						{ value: 'rose', label: 'Rose' },
						{ value: 'sahara', label: 'Sahara' },
						{ value: 'seafoam', label: 'Seafoam' },
						{ value: 'terminus', label: 'Terminus' },
						{ value: 'vintage', label: 'Vintage' },
						{ value: 'vox', label: 'Vox' },
						{ value: 'wintry', label: 'Wintry' },
					],
					defaultValue: 'reign',
				},
			],
		},
	];
}

// ── Management Sections ──

const SOURCE_TYPE_OPTIONS = [
	{ value: 'manga', label: 'Manga' },
	{ value: 'western', label: 'Western' },
	{ value: 'webcomic', label: 'Webcomic' },
];


async function getManagementSections(): Promise<ManagementSection[]> {
	const libs = db.select().from(userLibraries).orderBy(asc(userLibraries.sortOrder)).all();
	const cols = db.select().from(collections).orderBy(asc(collections.sortOrder)).all();
	const paths = db.select().from(localLibraryPaths).all();
	const smb = db.select().from(smbConnections).all();
	const repos = db.select().from(extensionRepos).all();

	let thumbStats: Record<string, unknown> = {};
	try {
		thumbStats = await getThumbStats() as Record<string, unknown>;
	} catch { /* ignore */ }

	return [
		{
			id: 'libraries',
			label: 'Libraries',
			icon: 'library',
			description: 'Create libraries to organize your collection by type (manga, western comics, webcomics).',
			endpoints: {
				list: '/api/user-libraries',
				create: '/api/user-libraries',
				update: '/api/user-libraries',
				delete: '/api/user-libraries',
			},
			createFields: [
				{ key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'My Manga' },
				{ key: 'type', label: 'Type', type: 'select', required: true, options: SOURCE_TYPE_OPTIONS, defaultValue: 'manga' },
			],
			itemFields: [
				{ key: 'name', label: 'Name', type: 'text' },
				{ key: 'type', label: 'Type', type: 'text' },
			],
			readerOverrides: true,
			items: libs as Record<string, unknown>[],
		},
		{
			id: 'collections',
			label: 'Collections',
			icon: 'folder',
			description: 'Collections group titles across libraries. Titles can belong to multiple collections.',
			endpoints: {
				list: '/api/collections',
				create: '/api/collections',
				update: '/api/collections',
				delete: '/api/collections',
			},
			createFields: [
				{ key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'My Collection' },
			],
			itemFields: [
				{ key: 'name', label: 'Name', type: 'text' },
			],
			readerOverrides: true,
			items: cols as Record<string, unknown>[],
		},
		{
			id: 'paths',
			label: 'Local Library Paths',
			icon: 'folder',
			description: 'Add directories containing manga collections (folders, CBZ, CBR).',
			endpoints: {
				list: '/api/settings/paths',
				create: '/api/settings/paths',
				update: '/api/settings/paths',
				delete: '/api/settings/paths',
			},
			createFields: [
				{ key: 'path', label: 'Path', type: 'path', required: true, placeholder: '/path/to/manga' },
				{ key: 'label', label: 'Label', type: 'text', placeholder: 'My Manga' },
				{ key: 'sourceType', label: 'Source Type', type: 'select', options: SOURCE_TYPE_OPTIONS, defaultValue: 'manga' },
			],
			itemFields: [
				{ key: 'path', label: 'Path', type: 'text' },
				{ key: 'label', label: 'Label', type: 'text' },
				{ key: 'sourceType', label: 'Source Type', type: 'select', options: SOURCE_TYPE_OPTIONS },
			],
			deleteConfirmation: 'Removing this path will also delete all titles from this path from your libraries, collections, and reading progress.\n\nContinue?',
			items: paths as Record<string, unknown>[],
		},
		{
			id: 'smb',
			label: 'SMB Shares',
			icon: 'network',
			description: 'Connect to Samba/Windows network shares with authentication.',
			endpoints: {
				list: '/api/settings/smb',
				create: '/api/settings/smb',
				update: '/api/settings/smb',
				delete: '/api/settings/smb',
			},
			createFields: [
				{ key: 'label', label: 'Label', type: 'text', required: true, placeholder: 'Media Server' },
				{ key: 'host', label: 'Host', type: 'text', required: true, placeholder: '192.168.1.100' },
				{ key: 'share', label: 'Share', type: 'text', required: true, placeholder: 'media' },
				{ key: 'path', label: 'Path', type: 'text', placeholder: 'comics' },
				{ key: 'username', label: 'Username', type: 'text', required: true, placeholder: 'user' },
				{ key: 'password', label: 'Password', type: 'password', required: true, placeholder: 'password' },
				{ key: 'domain', label: 'Domain', type: 'text', placeholder: 'WORKGROUP' },
				{ key: 'sourceType', label: 'Source Type', type: 'select', options: SOURCE_TYPE_OPTIONS, defaultValue: 'manga' },
			],
			itemFields: [
				{ key: 'label', label: 'Label', type: 'text' },
				{ key: 'host', label: 'Host', type: 'text' },
				{ key: 'sourceType', label: 'Source Type', type: 'select', options: SOURCE_TYPE_OPTIONS },
			],
			deleteConfirmation: 'Removing this SMB connection will also delete all titles from this source from your libraries, collections, and reading progress.\n\nContinue?',
			actions: [
				{ key: 'test', label: 'Test Connection', endpoint: '/api/settings/smb/test', method: 'POST' },
			],
			items: smb as Record<string, unknown>[],
		},
		{
			id: 'repos',
			label: 'Extension Repositories',
			icon: 'puzzle',
			description: 'Manage Mangayomi extension repositories. The default repo is used when no custom repos are configured.',
			endpoints: {
				list: '/api/settings/repos',
				create: '/api/settings/repos',
				delete: '/api/settings/repos',
			},
			createFields: [
				{ key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'My Repo' },
				{ key: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://example.com/index.json' },
			],
			itemFields: [
				{ key: 'name', label: 'Name', type: 'text' },
				{ key: 'url', label: 'URL', type: 'text' },
			],
			items: repos as Record<string, unknown>[],
		},
		{
			id: 'cache',
			label: 'Thumbnail Cache',
			icon: 'info',
			description: 'Cover images are resized and cached as thumbnails for faster loading.',
			endpoints: {
				list: '/api/cache/thumbnails',
			},
			actions: [
				{ key: 'clear', label: 'Clear All Thumbnails', endpoint: '/api/cache/thumbnails', method: 'DELETE', confirmation: 'Clear all cached thumbnails?' },
			],
			items: [],
			stats: thumbStats,
		},
		{
			id: 'seed',
			label: 'Test Data',
			icon: 'info',
			description: 'Generate fake reader activity (progress, heatmap data, ratings) for all titles in your library. Useful for testing the UI.',
			endpoints: {
				list: '',
			},
			actions: [
				{
					key: 'generate',
					label: 'Generate Activity Data',
					endpoint: '/api/settings/seed',
					method: 'POST',
					confirmation: 'This will generate reading progress, heatmap activity, and ratings for all titles currently in your library. Existing activity data will be overwritten.',
				},
				{
					key: 'clear',
					label: 'Clear All Activity Data',
					endpoint: '/api/settings/seed',
					method: 'DELETE',
					confirmation: 'This will remove all reading progress, activity history, and ratings. Your library and chapters will not be affected.',
					dangerous: true,
				},
			],
			items: [],
		},
		{
			id: 'danger',
			label: 'Danger Zone',
			icon: 'info',
			description: 'Permanently delete all data and start fresh. This cannot be undone.',
			endpoints: {
				list: '',
			},
			actions: [
				{
					key: 'reset',
					label: 'Reset Everything',
					endpoint: '/api/settings/reset',
					method: 'POST',
					dangerous: true,
					confirmation: 'This will permanently delete your entire library, all reading progress, installed extensions, extension repos, local library paths, and all app settings. There is no way to undo this.',
				},
			],
			items: [],
		},
	];
}

// ── Manifest Assembly ──

export async function getAppManifest(): Promise<AppManifest> {
	// Fetch dynamic data from DB
	const libs = db.select().from(userLibraries).orderBy(asc(userLibraries.sortOrder)).all();
	const cols = db.select().from(collections).orderBy(asc(collections.sortOrder)).all();
	const settings = db.select().from(appSettings).all();

	// Build settings values map
	const settingDefs = getSettingDefs();
	const values: Record<string, string> = {};

	// Populate defaults first
	for (const cat of settingDefs) {
		for (const s of cat.settings) {
			values[s.key] = s.defaultValue;
		}
	}

	// Override with stored values
	for (const row of settings) {
		if (row.key && row.value !== null) {
			values[row.key] = row.value;
		}
	}

	const management = await getManagementSections();

	return {
		nav: {
			static: getStaticNavItems(),
			libraries: libs.map((l) => ({
				id: l.id,
				label: l.name,
				type: l.type,
				icon: LIBRARY_TYPE_ICONS[l.type] ?? 'library',
				nsfw: !!l.nsfw,
			})),
			collections: cols.map((c) => ({
				id: c.id,
				label: c.name,
			})),
		},
		views: getViewDefs(),
		settings: {
			categories: settingDefs,
			values,
		},
		management,
	};
}
