const IMAGE_TIMEOUT_MS = 20_000;

/** Proxy a remote image URL, forwarding appropriate headers. */
export async function proxyImage(url: string, referer?: string): Promise<{ data: ArrayBuffer; contentType: string }> {
	const headers: Record<string, string> = {
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	};

	if (referer) {
		headers['Referer'] = referer;
	}

	const response = await fetch(url, { headers, signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });

	if (!response.ok) {
		throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
	}

	const data = await response.arrayBuffer();
	const contentType = response.headers.get('content-type') ?? 'image/jpeg';

	return { data, contentType };
}
