/**
 * omo-reader core initialization.
 *
 * Call `initialize()` once at startup before using any core functions.
 * Both the GUI (webview.ts) and TUI (main.ts) should call this.
 */

import { join } from 'path';
import { homedir } from 'os';
import { openDatabase, initializeDb } from './db/client.js';
import { setCacheDir } from './thumbnails/thumbnail-cache.js';
import { seedNativeSources, registerEnabledNativeSources } from './sources/manager.js';

export interface OmoConfig {
	/** Path to the SQLite database file. Overrides env/defaults. */
	dbPath?: string;
	/**
	 * Base cache directory (thumbnails stored under `<cachePath>/thumbnails/`).
	 * Defaults to `~/.cache/omo-reader`.
	 */
	cachePath?: string;
}

let _initialized = false;

/**
 * Initialize the omo-reader core: open database, run migrations,
 * configure cache paths.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * Path resolution for database:
 *   1. Explicit `config.dbPath`
 *   2. `OMO_DB_PATH` environment variable
 *   3. Legacy `data/omo-reader.db` in CWD (if it already exists)
 *   4. XDG default `~/.local/share/omo-reader/omo-reader.db`
 *
 * Path resolution for cache:
 *   1. Explicit `config.cachePath`
 *   2. `OMO_CACHE_PATH` environment variable
 *   3. Default `~/.cache/omo-reader`
 */
export function initialize(config: OmoConfig = {}): void {
	if (_initialized) return;

	// ── Database ──
	openDatabase(config.dbPath);
	initializeDb();

	// ── Native sources ──
	seedNativeSources();
	registerEnabledNativeSources();

	// ── Thumbnail cache ──
	const cachePath =
		config.cachePath ||
		process.env.OMO_CACHE_PATH ||
		join(homedir(), '.cache', 'omo-reader');
	setCacheDir(join(cachePath, 'thumbnails'));

	_initialized = true;
}
