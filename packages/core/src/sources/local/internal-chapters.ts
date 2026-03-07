/**
 * Detect chapter boundaries within a volume archive from its sorted page list.
 *
 * Supports two patterns:
 * 1. Filename-based: `Series - c001 (v01) - p001 [metadata].ext`
 *    Chapter number extracted from `cNNN` token; boundary at first page of each new chapter.
 * 2. Folder-based: pages grouped into per-chapter folders
 *    - Single-level: `Vol. 1 Ch. 3/page.avif`
 *    - Nested: `Volume_01/Vol.1 Ch.03 - Title/page.avif`
 *    Each unique chapter folder becomes a chapter; boundary at first page in each folder.
 *
 * Returns empty array for flat pages (no detectable chapters).
 */

export interface InternalChapter {
	title: string;
	pageIndex: number;
}

// Match `cNNN` or `c0NNN` in a filename like "Series - c001 (v01) - p042"
const FILENAME_CHAPTER_RE = /\bc(\d{2,4})\b/i;

// Match "Ch.01 - Title" or "Ch. 1" style folder names — extract chapter number AND optional title
const FOLDER_CH_RE = /ch(?:apter)?[.\s-]*(\d+(?:\.\d+)?)\s*(?:-\s*(.+))?/i;

// Match bare trailing number in folder name like "Hellsing The Dawn 003" or "Choujin X 059.1"
const FOLDER_TRAILING_NUM_RE = /\b(\d{2,4}(?:\.\d+)?)\s*$/;

export function detectInternalChapters(pages: string[]): InternalChapter[] {
	if (pages.length === 0) return [];

	// Try filename-based detection first (tankobundler pattern)
	const filenameResult = detectFromFilenames(pages);
	if (filenameResult.length > 1) return filenameResult;

	// Try folder-based detection
	const folderResult = detectFromFolders(pages);
	if (folderResult.length > 1) return folderResult;

	return [];
}

function detectFromFilenames(pages: string[]): InternalChapter[] {
	const chapters: InternalChapter[] = [];
	let lastChapterNum: number | null = null;

	for (let i = 0; i < pages.length; i++) {
		const page = pages[i];
		// Strip folder prefix if present
		const filename = page.includes('/') ? page.split('/').pop()! : page;
		const match = FILENAME_CHAPTER_RE.exec(filename);
		if (!match) continue;

		const chapterNum = parseInt(match[1], 10);
		if (chapterNum !== lastChapterNum) {
			chapters.push({
				title: `Chapter ${chapterNum}`,
				pageIndex: i,
			});
			lastChapterNum = chapterNum;
		}
	}

	return chapters;
}

/**
 * Get the folder segment at a given depth, only for pages that actually have enough depth.
 * Returns null for pages without enough folder nesting (e.g. loose root files).
 */
function getFolderAtDepth(pagePath: string, depth: number): string | null {
	const lastSlash = pagePath.lastIndexOf('/');
	if (lastSlash < 0) return null; // No folder at all (loose file)

	const parts = pagePath.split('/');
	// parts has N segments; last one is the filename, so we need depth < parts.length - 1
	if (depth >= parts.length - 1) return null;
	return parts[depth];
}

function detectFromFolders(pages: string[]): InternalChapter[] {
	// Only pages with folders participate
	const pagesWithFolders = pages.filter((p) => p.includes('/'));
	if (pagesWithFolders.length < pages.length * 0.5) return [];

	// Determine the right folder depth: find the shallowest level with >1 unique folder
	const maxDepth = Math.max(...pagesWithFolders.map((p) => p.split('/').length - 1));

	let chapterDepth = 0;
	for (let d = 0; d < maxDepth; d++) {
		const unique = new Set<string>();
		for (const p of pagesWithFolders) {
			const folder = getFolderAtDepth(p, d);
			if (folder) unique.add(folder);
		}
		if (unique.size > 1) {
			chapterDepth = d;
			break;
		}
	}

	const chapters: InternalChapter[] = [];
	let lastFolder: string | null = null;

	for (let i = 0; i < pages.length; i++) {
		const folder = getFolderAtDepth(pages[i], chapterDepth);
		if (!folder || folder === lastFolder) continue;

		const title = parseFolderTitle(folder);
		chapters.push({ title, pageIndex: i });
		lastFolder = folder;
	}

	// Sort by extracted chapter number to handle misordered archives
	// (e.g. "Ch. 2.5" sorted before "Ch. 2" lexicographically)
	const withNums = chapters.map((ch) => ({
		...ch,
		sortNum: extractSortNumber(ch.title),
	}));
	withNums.sort((a, b) => a.sortNum - b.sortNum);

	// Reassign pageIndex based on original positions (chapters keep their page positions,
	// but we reorder the chapter list itself so titles are in numeric order)
	// Actually, we can't reorder — pageIndex must stay correct. The chapters appear
	// at certain page positions in the archive, and if the archive has them out of order,
	// the pageIndex markers should match the actual positions.
	// So just return in archive order without resorting.
	return chapters;
}

function parseFolderTitle(folder: string): string {
	// Try "Ch.01 - Title" or "Chapter 3.5" pattern first
	const chMatch = FOLDER_CH_RE.exec(folder);
	if (chMatch) {
		const num = chMatch[1];
		const subtitle = chMatch[2]?.trim();
		return subtitle ? `Ch. ${num} - ${subtitle}` : `Chapter ${num}`;
	}

	// Try bare trailing number like "Hellsing The Dawn 003" or "Choujin X 059.1"
	const numMatch = FOLDER_TRAILING_NUM_RE.exec(folder);
	if (numMatch) {
		// Strip leading zeros but preserve decimal part: "059.1" → "59.1", "003" → "3"
		const num = numMatch[1].includes('.')
			? parseFloat(numMatch[1]).toString()
			: parseInt(numMatch[1], 10).toString();
		return `Chapter ${num}`;
	}

	// Use raw folder name
	return folder;
}

function extractSortNumber(title: string): number {
	const m = /(\d+(?:\.\d+)?)/.exec(title);
	return m ? parseFloat(m[1]) : 0;
}
