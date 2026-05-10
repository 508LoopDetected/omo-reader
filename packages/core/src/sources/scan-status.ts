/**
 * Live tracker for in-flight chapter/work scans.
 *
 * The warmer and lazy `getChapterDetail` calls mark items here so the GUI can
 * subscribe (via /api/cache/scan-status) and render spinners on the specific
 * volumes/works currently being parsed — same pattern as Plex's per-album
 * "scanning" indicator.
 */

const scanningChapters = new Set<string>();
const scanningWorks = new Set<string>();

function chapterKey(sourceId: string, chapterId: string): string {
	return `${sourceId}|${chapterId}`;
}

function workKey(sourceId: string, workId: string): string {
	return `${sourceId}|${workId}`;
}

export function markChapterScanning(sourceId: string, chapterId: string): void {
	scanningChapters.add(chapterKey(sourceId, chapterId));
}

export function markChapterScanned(sourceId: string, chapterId: string): void {
	scanningChapters.delete(chapterKey(sourceId, chapterId));
}

export function markWorkScanning(sourceId: string, workId: string): void {
	scanningWorks.add(workKey(sourceId, workId));
}

export function markWorkScanned(sourceId: string, workId: string): void {
	scanningWorks.delete(workKey(sourceId, workId));
}

export function getScanStatus(): { chapters: string[]; works: string[]; active: boolean } {
	return {
		chapters: Array.from(scanningChapters),
		works: Array.from(scanningWorks),
		active: scanningChapters.size > 0 || scanningWorks.size > 0,
	};
}
