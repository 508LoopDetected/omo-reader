/**
 * Live scan-status store. Polls /api/cache/scan-status periodically so
 * components can render spinners on the chapters/works currently being parsed.
 *
 * Polls fast (1s) when anything is active so spinners turn off promptly,
 * slow (8s) when idle so we're not chatty for nothing.
 */

import { writable, get } from 'svelte/store';
import { apiFetch } from '$lib/api';

export interface ScanStatus {
	chapters: Set<string>;  // composite "sourceId|chapterId"
	works: Set<string>;     // composite "sourceId|workId"
	active: boolean;
}

const empty: ScanStatus = { chapters: new Set(), works: new Set(), active: false };

export const scanStatus = writable<ScanStatus>(empty);

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

async function poll() {
	try {
		const res = await apiFetch('/api/cache/scan-status');
		if (res.ok) {
			const data = await res.json() as { chapters: string[]; works: string[]; active: boolean };
			scanStatus.set({
				chapters: new Set(data.chapters),
				works: new Set(data.works),
				active: data.active,
			});
		}
	} catch { /* network blip — ignore, retry next tick */ }

	const current = get(scanStatus);
	const delay = current.active ? 1000 : 8000;
	timer = setTimeout(poll, delay);
}

/** Start polling. Idempotent — calling more than once is a no-op. */
export function startScanStatusPolling(): void {
	if (started) return;
	started = true;
	poll();
}

/** Composite key helpers — use these so components don't have to know the format. */
export function chapterIsScanning(status: ScanStatus, sourceId: string, chapterId: string): boolean {
	return status.chapters.has(`${sourceId}|${chapterId}`);
}

export function workIsScanning(status: ScanStatus, sourceId: string, workId: string): boolean {
	return status.works.has(`${sourceId}|${workId}`);
}
