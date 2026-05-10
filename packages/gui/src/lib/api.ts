/**
 * API client: routes fetches and image URLs through the configured server.
 *
 * baseUrl unset → same-origin (Electron-local: in-process server serves both GUI and API).
 * baseUrl set → remote server (e.g. http://videodrome:3210). authToken added as Bearer header
 * if also set, matching core's optional OMO_AUTH_TOKEN middleware.
 */

import { writable, get } from 'svelte/store';

const STORAGE_KEY = 'omo:connection';

export interface Connection {
	baseUrl: string;
	authToken: string;
}

function load(): Connection {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return {
				baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl.replace(/\/+$/, '') : '',
				authToken: typeof parsed.authToken === 'string' ? parsed.authToken : '',
			};
		}
	} catch {
		/* ignore */
	}
	return { baseUrl: '', authToken: '' };
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
	connection.set({
		baseUrl: next.baseUrl.replace(/\/+$/, ''),
		authToken: next.authToken,
	});
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
	const { baseUrl } = get(connection);
	const url = baseUrl && path.startsWith('/') ? `${baseUrl}${path}` : path;
	return fetch(url, { ...init, headers: buildHeaders(init) });
}

/** Rewrite a server-relative URL (e.g. `/api/proxy/image?...`) to point at the configured server. */
export function apiUrl(path: string | undefined | null): string {
	if (!path) return path ?? '';
	if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
	if (!path.startsWith('/')) return path;
	const { baseUrl, authToken } = get(connection);
	let url = baseUrl ? `${baseUrl}${path}` : path;
	// <img src> can't set headers; fall back to query-string token for /api/* paths
	// when an auth token is configured. Server accepts either.
	if (authToken && path.startsWith('/api/')) {
		const sep = url.includes('?') ? '&' : '?';
		url = `${url}${sep}token=${encodeURIComponent(authToken)}`;
	}
	return url;
}
