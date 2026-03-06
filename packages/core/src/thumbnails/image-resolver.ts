/**
 * Resolves any image URL to raw bytes by calling internal functions directly,
 * avoiding HTTP self-requests.
 */

import { getImage } from '../sources/local/local-source.js';
import { getSmbImage } from '../sources/smb/smb-source.js';
import { proxyImage } from '../proxy/image-proxy.js';

export async function resolveImageUrl(
	url: string,
	signal?: AbortSignal,
): Promise<{ data: Buffer; contentType: string }> {
	// Local image: /api/local/image?path=X&entry=Y&pageIndex=Z
	if (url.startsWith('/api/local/image')) {
		const params = new URL(url, 'http://localhost').searchParams;
		const path = params.get('path');
		if (!path) throw new Error('Missing path parameter for local image');
		const entry = params.get('entry') ?? undefined;
		const pageIndexParam = params.get('pageIndex');
		const pageIndex = pageIndexParam !== null ? parseInt(pageIndexParam, 10) : undefined;
		const result = await getImage(path, entry, pageIndex);
		return { data: result.data, contentType: result.mimeType };
	}

	// SMB image: /api/smb/image?connectionId=X&path=Y&entry=Z&pageIndex=W
	if (url.startsWith('/api/smb/image')) {
		const params = new URL(url, 'http://localhost').searchParams;
		const connectionId = params.get('connectionId');
		const path = params.get('path');
		if (!connectionId || !path) throw new Error('Missing connectionId or path for SMB image');
		const entry = params.get('entry') ?? undefined;
		const pageIndexParam = params.get('pageIndex');
		const pageIndex = pageIndexParam !== null ? parseInt(pageIndexParam, 10) : undefined;
		const result = await getSmbImage(connectionId, path, entry, pageIndex);
		return { data: result.data, contentType: result.mimeType };
	}

	// Proxy image: /api/proxy/image?url=X&referer=Y
	if (url.startsWith('/api/proxy/image')) {
		const params = new URL(url, 'http://localhost').searchParams;
		const imageUrl = params.get('url');
		if (!imageUrl) throw new Error('Missing url parameter for proxy image');
		const referer = params.get('referer') ?? undefined;
		const result = await proxyImage(imageUrl, referer);
		return { data: Buffer.from(result.data), contentType: result.contentType };
	}

	// External HTTP(S) URL — proxy it directly
	if (url.startsWith('http://') || url.startsWith('https://')) {
		const result = await proxyImage(url);
		return { data: Buffer.from(result.data), contentType: result.contentType };
	}

	throw new Error(`Cannot resolve image URL: ${url}`);
}
