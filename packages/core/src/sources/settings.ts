/** Thin app-settings reader — avoids circular deps between manager and sources. */

import { db } from '../db/client.js';
import { appSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export function getAppSetting(key: string): string | null {
	const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
	return row?.value ?? null;
}

export type NsfwMode = 'sfw' | 'nsfw' | 'all';

export function getNsfwMode(): NsfwMode {
	const val = getAppSetting('browse.nsfwMode');
	if (val === 'nsfw' || val === 'all') return val;
	return 'sfw';
}
