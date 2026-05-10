import { isAbsolute, join, resolve } from 'path';

/**
 * Optional base directory for relative Local Share paths.
 *
 * When `OMO_LIBRARY_ROOT` is set (typical for headless deployments where the
 * library is bind-mounted to a known in-container path), users enter Local
 * Share paths relative to it — e.g. `Western` instead of `/comics/Western`.
 *
 * When unset (Electron-local, dev), relative paths resolve against cwd as
 * before, preserving backwards compatibility.
 */

export function getLibraryRoot(): string | null {
	const root = process.env.OMO_LIBRARY_ROOT?.trim();
	return root ? root : null;
}

/**
 * Resolve a stored Local Share path to an absolute filesystem path.
 *
 * - Absolute input → returned as-is (escape hatch for paths outside the root).
 * - Relative input + library root set → joined to the root.
 * - Relative input + no root → resolved against cwd (legacy behavior).
 */
export function resolveLibraryPath(input: string): string {
	if (isAbsolute(input)) return input;
	const root = getLibraryRoot();
	return root ? join(root, input) : resolve(input);
}
