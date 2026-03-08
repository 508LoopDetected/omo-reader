import { SvelteURL } from 'svelte/reactivity';
import type { Component } from 'svelte';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = Component<any, any, any>;

export interface Route {
	pattern: RegExp;
	keys: string[];
	load: () => Promise<{ default: AnyComponent }>;
}

export interface RouteMatch {
	route: Route;
	params: Record<string, string>;
}

type NavigateCallback = (info: { from: URL | null; to: URL }) => void;

const routes: Route[] = [
	{ pattern: /^\/$/, keys: [], load: () => import('../pages/Home.svelte') },
	{ pattern: /^\/library$/, keys: [], load: () => import('../pages/Library.svelte') },
	{ pattern: /^\/library\/([^/]+)$/, keys: ['libraryId'], load: () => import('../pages/LibraryDetail.svelte') },
	{ pattern: /^\/sources$/, keys: [], load: () => import('../pages/Sources.svelte') },
	{ pattern: /^\/sources\/([^/]+)$/, keys: ['sourceId'], load: () => import('../pages/SourceDetail.svelte') },
	{ pattern: /^\/work\/([^/]+)\/([^/]+)\/([^/]+)$/, keys: ['sourceId', 'workId', 'chapterId'], load: () => import('../pages/ChapterReader.svelte') },
	{ pattern: /^\/work\/([^/]+)\/([^/]+)$/, keys: ['sourceId', 'workId'], load: () => import('../pages/WorkDetail.svelte') },
	{ pattern: /^\/extensions$/, keys: [], load: () => import('../pages/Extensions.svelte') },
	{ pattern: /^\/settings$/, keys: [], load: () => import('../pages/Settings.svelte') },
	{ pattern: /^\/collection\/([^/]+)$/, keys: ['collectionId'], load: () => import('../pages/CollectionDetail.svelte') },
];

export const url = new SvelteURL(window.location.href);

const navigateCallbacks: NavigateCallback[] = [];

export function match(pathname: string): RouteMatch | null {
	for (const route of routes) {
		const m = route.pattern.exec(pathname);
		if (m) {
			const params: Record<string, string> = {};
			for (let i = 0; i < route.keys.length; i++) {
				params[route.keys[i]] = decodeURIComponent(m[i + 1]);
			}
			return { route, params };
		}
	}
	return null;
}

/** Navigation generation counter — incremented on every navigation to detect stale async loads. */
export let navGeneration = 0;

/** Reader route — never added to browser history (always replaces). */
const READER_PATTERN = /^\/work\/[^/]+\/[^/]+\/[^/]+$/;

export function goto(path: string, { replace = false, force = false }: { replace?: boolean; force?: boolean } = {}) {
	// Skip if already on this path (unless forced)
	const target = new URL(path, window.location.origin);
	if (!force && target.pathname === url.pathname && target.search === url.search && target.hash === url.hash) return;

	// Reader pages never create history entries — always replace
	const shouldReplace = replace || READER_PATTERN.test(target.pathname);

	const prev = new URL(url.href);
	if (shouldReplace) {
		history.replaceState(null, '', path);
	} else {
		history.pushState(null, '', path);
	}
	navGeneration++;
	url.href = window.location.href;
	for (const cb of navigateCallbacks) {
		cb({ from: prev, to: new URL(url.href) });
	}
}

export function onNavigate(cb: NavigateCallback): () => void {
	navigateCallbacks.push(cb);
	return () => {
		const i = navigateCallbacks.indexOf(cb);
		if (i >= 0) navigateCallbacks.splice(i, 1);
	};
}

window.addEventListener('popstate', () => {
	const prev = new URL(url.href);
	navGeneration++;
	url.href = window.location.href;
	for (const cb of navigateCallbacks) {
		cb({ from: prev, to: new URL(url.href) });
	}
});
