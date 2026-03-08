import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const userLibraries = sqliteTable('user_libraries', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	type: text('type', { enum: ['manga', 'western', 'webcomic'] }).notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	readerDirection: text('reader_direction'),
	readerOffset: text('reader_offset'),
	coverArtMode: text('cover_art_mode'),
	nsfw: integer('nsfw', { mode: 'boolean' }).notNull().default(false),
	createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const sources = sqliteTable('sources', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	lang: text('lang').notNull().default('en'),
	type: text('type', { enum: ['local', 'native', 'extension', 'smb'] }).notNull(),
	baseUrl: text('base_url'),
	iconUrl: text('icon_url'),
	jsCode: text('js_code'),
	version: text('version'),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const collections = sqliteTable('collections', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	readerDirection: text('reader_direction'),
	readerOffset: text('reader_offset'),
	coverArtMode: text('cover_art_mode'),
});

export const collectionItems = sqliteTable('collection_items', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	collectionId: text('collection_id').notNull(),
	libraryItemId: integer('library_item_id').notNull(),
});

export const library = sqliteTable('library', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sourceId: text('source_id').notNull(),
	workId: text('work_id').notNull(),
	title: text('title').notNull(),
	coverUrl: text('cover_url'),
	url: text('url').notNull(),
	author: text('author'),
	artist: text('artist'),
	description: text('description'),
	genres: text('genres'), // JSON array
	status: text('status'),
	addedAt: integer('added_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
	lastReadAt: integer('last_read_at', { mode: 'timestamp' }),
	nsfw: integer('nsfw', { mode: 'boolean' }).notNull().default(false),
	libraryId: text('library_id'),
	readerDirection: text('reader_direction'),
	readerOffset: text('reader_offset'),
	coverArtMode: text('cover_art_mode'),
});

export const chapters = sqliteTable('chapters', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sourceId: text('source_id').notNull(),
	workId: text('work_id').notNull(),
	chapterId: text('chapter_id').notNull(),
	title: text('title').notNull(),
	chapterNumber: real('chapter_number'),
	url: text('url').notNull(),
	dateUploaded: integer('date_uploaded'),
	scanlator: text('scanlator'),
	read: integer('read', { mode: 'boolean' }).notNull().default(false),
	lastPageRead: integer('last_page_read').default(0),
});

export const readingProgress = sqliteTable('reading_progress', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sourceId: text('source_id').notNull(),
	workId: text('work_id').notNull(),
	chapterId: text('chapter_id').notNull(),
	page: integer('page').notNull().default(0),
	totalPages: integer('total_pages').notNull().default(0),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
	dismissed: integer('dismissed', { mode: 'boolean' }).notNull().default(false),
});

export const sourcePreferences = sqliteTable('source_preferences', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sourceId: text('source_id').notNull(),
	key: text('key').notNull(),
	value: text('value'),
});

export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value'),
});

export const extensionRepos = sqliteTable('extension_repos', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	url: text('url').notNull(),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
});

export const localLibraryPaths = sqliteTable('local_library_paths', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	path: text('path').notNull(),
	label: text('label'),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	libraryId: text('library_id'),
	sourceType: text('source_type').default('manga'),
	browseMode: text('browse_mode').default('auto'),
});

export const titleRatings = sqliteTable('title_ratings', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sourceId: text('source_id').notNull(),
	workId: text('work_id').notNull(),
	rating: integer('rating').notNull(), // 0-10 scale (displays as 5 stars with half-star precision)
	updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const readingActivity = sqliteTable('reading_activity', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sourceId: text('source_id').notNull(),
	workId: text('work_id').notNull(),
	date: text('date').notNull(), // YYYY-MM-DD
	pagesRead: integer('pages_read').notNull().default(0),
});

export const smbConnections = sqliteTable('smb_connections', {
	id: text('id').primaryKey(),
	label: text('label').notNull(),
	host: text('host').notNull(),
	share: text('share').notNull(),
	path: text('path').default(''),
	domain: text('domain').default(''),
	username: text('username').notNull(),
	password: text('password').notNull(),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	libraryId: text('library_id'),
	sourceType: text('source_type').default('manga'),
	browseMode: text('browse_mode').default('auto'),
	createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});
