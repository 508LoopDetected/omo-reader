/**
 * Frontend helper to route cover URLs through the thumbnail endpoint.
 */
export function thumbnailUrl(
	coverUrl: string | undefined | null,
	sourceId?: string,
	workId?: string,
): string | undefined {
	if (!coverUrl) return undefined;
	// Chapter-cover URLs already serve thumbnails directly
	if (coverUrl.includes('/chapter-cover?')) return coverUrl;
	let url = `/api/thumbnail?url=${encodeURIComponent(coverUrl)}`;
	if (sourceId) url += `&sourceId=${encodeURIComponent(sourceId)}`;
	if (workId) url += `&workId=${encodeURIComponent(workId)}`;
	return url;
}
