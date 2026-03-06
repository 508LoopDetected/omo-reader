/**
 * XKCD JSON API client with rate limiting and retry logic.
 */

import { RateLimiter } from '../rate-limiter.js';
import type { XkcdComic } from './xkcd-types.js';

const limiter = new RateLimiter(2, 1000);

const MAX_RETRIES = 3;
const RETRY_DELAYS = [300, 800, 2000];
const FETCH_TIMEOUT_MS = 15_000;

function isRetryable(err: unknown): boolean {
	if (err instanceof DOMException && err.name === 'TimeoutError') return true;
	if (err instanceof DOMException && err.name === 'AbortError') return true;
	if (err instanceof TypeError && (err as NodeJS.ErrnoException).cause) {
		const cause = (err as NodeJS.ErrnoException).cause as { code?: string };
		if (cause.code === 'UND_ERR_SOCKET' || cause.code === 'ECONNRESET' || cause.code === 'ETIMEDOUT') {
			return true;
		}
	}
	return false;
}

async function xkcdFetch<T>(url: string): Promise<T> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		await limiter.acquire();
		try {
			const res = await fetch(url, {
				headers: { 'User-Agent': 'omo-reader/1.0' },
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (!res.ok) {
				throw new Error(`XKCD API error ${res.status}: ${res.statusText} for ${url}`);
			}
			return res.json() as Promise<T>;
		} catch (err) {
			lastError = err;
			if (attempt < MAX_RETRIES && isRetryable(err)) {
				await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
				continue;
			}
			throw err;
		}
	}

	throw lastError;
}

export async function getLatest(): Promise<XkcdComic> {
	return xkcdFetch<XkcdComic>('https://xkcd.com/info.0.json');
}

export async function getComic(num: number): Promise<XkcdComic> {
	return xkcdFetch<XkcdComic>(`https://xkcd.com/${num}/info.0.json`);
}
