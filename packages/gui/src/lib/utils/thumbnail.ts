/**
 * Frontend helper to route cover URLs through the thumbnail endpoint.
 */
import { apiUrl } from '$lib/api';

export function thumbnailUrl(
	coverUrl: string | undefined | null,
	sourceId?: string,
	workId?: string,
): string | undefined {
	if (!coverUrl) return undefined;
	// Chapter-cover URLs already serve thumbnails directly
	if (coverUrl.includes('/chapter-cover?')) return apiUrl(coverUrl);
	let url = `/api/thumbnail?url=${encodeURIComponent(coverUrl)}`;
	if (sourceId) url += `&sourceId=${encodeURIComponent(sourceId)}`;
	if (workId) url += `&workId=${encodeURIComponent(workId)}`;
	return apiUrl(url);
}
