/**
 * Filesystem abstraction for scanning — allows local and SMB sources
 * to share the same scanning, metadata, and chapter detection logic.
 */

export interface DirEntry {
	name: string;
	isDirectory: boolean;
}

export interface FsAdapter {
	readdir(path: string): Promise<DirEntry[]>;
	readFile(path: string): Promise<Buffer>;
	join(...parts: string[]): string;
	/** Get the last path segment, optionally stripping an extension. */
	basename(path: string, ext?: string): string;
	/** Build an image API URL for the given path, optionally referencing an archive entry. */
	imageUrl(path: string, entry?: string): string;
	/** Get mtime in ms for cache-busting. Returns undefined if unsupported. */
	getMtimeMs(path: string): Promise<number | undefined>;
}
