/**
 * API client: routes fetches and image URLs through the same-origin server.
 *
 * The GUI is always served by the @omo/core HTTP server it talks to (Docker
 * deploys, dev with Vite proxy, browsers, PWA — all same-origin). The only
 * per-device state is the optional bearer token for OMO_AUTH_TOKEN auth.
 */

import { writable, get } from 'svelte/store';

const STORAGE_KEY = 'omo:connection';

export interface Connection {
	authToken: string;
}

function load(): Connection {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return {
				authToken: typeof parsed.authToken === 'string' ? parsed.authToken : '',
			};
		}
	} catch {
		/* ignore */
	}
	return { authToken: '' };
}

export const connection = writable<Connection>(load());

connection.subscribe((value) => {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch {
		/* ignore */
	}
});

export function setConnection(next: Connection): void {
	connection.set({ authToken: next.authToken });
}

function buildHeaders(init?: RequestInit): HeadersInit | undefined {
	const { authToken } = get(connection);
	if (!authToken) return init?.headers;
	const headers = new Headers(init?.headers);
	headers.set('Authorization', `Bearer ${authToken}`);
	return headers;
}

/** Drop-in for fetch() against the omo API. Pass paths starting with `/api/...`. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
	return fetch(path, { ...init, headers: buildHeaders(init) });
}

/** Rewrite a server-relative URL (e.g. `/api/proxy/image?...`) to carry the
 *  auth token via query string for `<img src>` (which can't set headers). */
export function apiUrl(path: string | undefined | null): string {
	if (!path) return path ?? '';
	if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
	if (!path.startsWith('/')) return path;
	const { authToken } = get(connection);
	if (authToken && path.startsWith('/api/')) {
		const sep = path.includes('?') ? '&' : '?';
		return `${path}${sep}token=${encodeURIComponent(authToken)}`;
	}
	return path;
}
