import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { resolve, dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { homedir } from 'os';

type OmoDatabase = BetterSQLite3Database<typeof schema>;

// ── Lazy-init state ──

let _sqlite: Database.Database | null = null;

export let db: OmoDatabase = null as unknown as OmoDatabase;

/**
 * Resolve the database file path.
 *
 * Priority:
 *   1. Explicit `dbPath` argument (from `initialize()`)
 *   2. `OMO_DB_PATH` environment variable
 *   3. XDG default: `~/.local/share/omo-reader/omo-reader.db`
 */
export function resolveDbPath(explicit?: string): string {
	if (explicit) return resolve(explicit);
	if (process.env.OMO_DB_PATH) return resolve(process.env.OMO_DB_PATH);
	return join(homedir(), '.local', 'share', 'omo-reader', 'omo-reader.db');
}

/**
 * Open the database at the given path (or the resolved default).
 * Called by `initialize()` in init.ts — do NOT call directly.
 */
export function openDatabase(dbPath?: string): void {
	if (_sqlite) return; // already open

	const resolvedPath = resolveDbPath(dbPath);
	mkdirSync(dirname(resolvedPath), { recursive: true });

	_sqlite = new Database(resolvedPath);
	_sqlite.pragma('journal_mode = WAL');
	_sqlite.pragma('foreign_keys = ON');

	db = drizzle(_sqlite, { schema });
}

// ── Schema bootstrap + migrations ──

export function initializeDb(): void {
	const sqlite = _sqlite;
	if (!sqlite) return;

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS sources (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			lang TEXT NOT NULL DEFAULT 'en',
			type TEXT NOT NULL CHECK(type IN ('local', 'extension', 'smb')),
			base_url TEXT,
			icon_url TEXT,
			js_code TEXT,
			version TEXT,
			enabled INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS library (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			source_id TEXT NOT NULL,
			work_id TEXT NOT NULL,
			title TEXT NOT NULL,
			cover_url TEXT,
			url TEXT NOT NULL,
			author TEXT,
			artist TEXT,
			description TEXT,
			genres TEXT,
			status TEXT,
			added_at INTEGER,
			last_read_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS chapters (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			source_id TEXT NOT NULL,
			work_id TEXT NOT NULL,
			chapter_id TEXT NOT NULL,
			title TEXT NOT NULL,
			chapter_number REAL,
			url TEXT NOT NULL,
			date_uploaded INTEGER,
			scanlator TEXT,
			read INTEGER NOT NULL DEFAULT 0,
			last_page_read INTEGER DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS reading_progress (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			source_id TEXT NOT NULL,
			work_id TEXT NOT NULL,
			chapter_id TEXT NOT NULL,
			page INTEGER NOT NULL DEFAULT 0,
			total_pages INTEGER NOT NULL DEFAULT 0,
			updated_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS source_preferences (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			source_id TEXT NOT NULL,
			key TEXT NOT NULL,
			value TEXT
		);

		CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT PRIMARY KEY,
			value TEXT
		);

		CREATE TABLE IF NOT EXISTS extension_repos (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			url TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1
		);

		CREATE TABLE IF NOT EXISTS local_library_paths (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			path TEXT NOT NULL,
			label TEXT,
			enabled INTEGER NOT NULL DEFAULT 1,
			library_id TEXT,
			source_type TEXT DEFAULT 'manga',
			browse_mode TEXT DEFAULT 'auto'
		);

		CREATE TABLE IF NOT EXISTS smb_connections (
			id TEXT PRIMARY KEY,
			label TEXT NOT NULL,
			host TEXT NOT NULL,
			share TEXT NOT NULL,
			path TEXT DEFAULT '',
			domain TEXT DEFAULT '',
			username TEXT NOT NULL,
			password TEXT NOT NULL,
			enabled INTEGER DEFAULT 1,
			library_id TEXT,
			source_type TEXT DEFAULT 'manga',
			browse_mode TEXT DEFAULT 'auto',
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS user_libraries (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			type TEXT NOT NULL CHECK(type IN ('manga', 'western', 'webcomic')),
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_source_prefs ON source_preferences(source_id, key);
	`);

	// Migrations
	const cols = sqlite.prepare("PRAGMA table_info(reading_progress)").all() as { name: string }[];
	if (!cols.some((c) => c.name === 'dismissed')) {
		sqlite.exec("ALTER TABLE reading_progress ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0");
	}

	sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_library_source_work ON library(source_id, work_id)");
	sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_chapter ON reading_progress(source_id, work_id, chapter_id)");
	sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_unique ON chapters(source_id, work_id, chapter_id)");

	const libCols = sqlite.prepare("PRAGMA table_info(library)").all() as { name: string }[];
	if (!libCols.some((c) => c.name === 'nsfw')) {
		sqlite.exec("ALTER TABLE library ADD COLUMN nsfw INTEGER NOT NULL DEFAULT 0");
	}
	if (!libCols.some((c) => c.name === 'library_id')) {
		sqlite.exec("ALTER TABLE library ADD COLUMN library_id TEXT");
	}

	const pathCols = sqlite.prepare("PRAGMA table_info(local_library_paths)").all() as { name: string }[];
	if (!pathCols.some((c) => c.name === 'library_id')) {
		sqlite.exec("ALTER TABLE local_library_paths ADD COLUMN library_id TEXT");
	}
	if (!pathCols.some((c) => c.name === 'source_type')) {
		sqlite.exec("ALTER TABLE local_library_paths ADD COLUMN source_type TEXT DEFAULT 'manga'");
	}

	const smbCols = sqlite.prepare("PRAGMA table_info(smb_connections)").all() as { name: string }[];
	if (!smbCols.some((c) => c.name === 'library_id')) {
		sqlite.exec("ALTER TABLE smb_connections ADD COLUMN library_id TEXT");
	}
	if (!smbCols.some((c) => c.name === 'source_type')) {
		sqlite.exec("ALTER TABLE smb_connections ADD COLUMN source_type TEXT DEFAULT 'manga'");
	}
	if (!smbCols.some((c) => c.name === 'browse_mode')) {
		sqlite.exec("ALTER TABLE smb_connections ADD COLUMN browse_mode TEXT DEFAULT 'auto'");
	}

	if (!pathCols.some((c) => c.name === 'browse_mode')) {
		sqlite.exec("ALTER TABLE local_library_paths ADD COLUMN browse_mode TEXT DEFAULT 'auto'");
	}

	const ulCols = sqlite.prepare("PRAGMA table_info(user_libraries)").all() as { name: string }[];
	if (!ulCols.some((c) => c.name === 'reader_direction')) {
		sqlite.exec("ALTER TABLE user_libraries ADD COLUMN reader_direction TEXT");
	}
	if (!ulCols.some((c) => c.name === 'reader_offset')) {
		sqlite.exec("ALTER TABLE user_libraries ADD COLUMN reader_offset TEXT");
	}

	if (!libCols.some((c) => c.name === 'reader_direction')) {
		sqlite.exec("ALTER TABLE library ADD COLUMN reader_direction TEXT");
	}
	if (!libCols.some((c) => c.name === 'reader_offset')) {
		sqlite.exec("ALTER TABLE library ADD COLUMN reader_offset TEXT");
	}
	if (!libCols.some((c) => c.name === 'cover_art_mode')) {
		sqlite.exec("ALTER TABLE library ADD COLUMN cover_art_mode TEXT");
	}

	if (!ulCols.some((c) => c.name === 'cover_art_mode')) {
		sqlite.exec("ALTER TABLE user_libraries ADD COLUMN cover_art_mode TEXT");
	}
	if (!ulCols.some((c) => c.name === 'nsfw')) {
		sqlite.exec("ALTER TABLE user_libraries ADD COLUMN nsfw INTEGER NOT NULL DEFAULT 0");
	}

	const oldColCols = sqlite.prepare("PRAGMA table_info(collections)").all() as { name: string }[];
	if (oldColCols.some((c) => c.name === 'library_id')) {
		sqlite.exec("DROP TABLE collections");
	}
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS collections (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			sort_order INTEGER NOT NULL DEFAULT 0,
			reader_direction TEXT,
			reader_offset TEXT,
			cover_art_mode TEXT
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS collection_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			collection_id TEXT NOT NULL,
			library_item_id INTEGER NOT NULL
		)
	`);
	sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_item ON collection_items(collection_id, library_item_id)");

	// Migrate sourceId='local' → 'local:{pathId}' for per-path local sources
	const hasOldLocal = (sqlite.prepare("SELECT COUNT(*) as cnt FROM library WHERE source_id = 'local'").get() as { cnt: number }).cnt;
	if (hasOldLocal > 0) {
		const paths = sqlite.prepare("SELECT id, path FROM local_library_paths").all() as { id: number; path: string }[];
		const rows = sqlite.prepare("SELECT id, work_id FROM library WHERE source_id = 'local'").all() as { id: number; work_id: string }[];

		const updateLib = sqlite.prepare("UPDATE library SET source_id = ? WHERE id = ?");
		const updateChapters = sqlite.prepare("UPDATE chapters SET source_id = ? WHERE source_id = 'local' AND work_id = ?");
		const updateProgress = sqlite.prepare("UPDATE reading_progress SET source_id = ? WHERE source_id = 'local' AND work_id = ?");

		for (const row of rows) {
			let decoded: string;
			try {
				decoded = Buffer.from(row.work_id, 'base64url').toString('utf-8');
			} catch { continue; }

			let matchedPathId: number | null = null;
			for (const p of paths) {
				if (decoded.startsWith(p.path)) {
					matchedPathId = p.id;
					break;
				}
			}

			if (matchedPathId !== null) {
				const newSourceId = `local:${matchedPathId}`;
				updateLib.run(newSourceId, row.id);
				updateChapters.run(newSourceId, row.work_id);
				updateProgress.run(newSourceId, row.work_id);
			}
		}
	}
}

/** Wipe all user data from the database. Preserves table structure. */
export function resetDatabase(): void {
	const sqlite = _sqlite;
	if (!sqlite) throw new Error('Database not open — call initialize() first.');

	sqlite.exec(`
		DELETE FROM library;
		DELETE FROM chapters;
		DELETE FROM reading_progress;
		DELETE FROM sources;
		DELETE FROM source_preferences;
		DELETE FROM app_settings;
		DELETE FROM extension_repos;
		DELETE FROM local_library_paths;
		DELETE FROM smb_connections;
		DELETE FROM user_libraries;
		DELETE FROM collections;
		DELETE FROM collection_items;
	`);
	sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');
}
