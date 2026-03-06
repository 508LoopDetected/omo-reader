/**
 * Reader settings service — per-title reader preference CRUD.
 */

import { db } from '../db/client.js';
import { library } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getResolvedReaderSettings, getResolvedCoverArtMode } from '../sources/manager.js';

/** Get resolved reader settings for a work (cascaded from title → collection → library → defaults). */
export function getReaderSettings(sourceId: string, workId: string) {
	const settings = getResolvedReaderSettings(sourceId, workId);
	const coverArtMode = getResolvedCoverArtMode(sourceId, workId);
	return { ...settings, coverArtMode };
}

/** Save per-title reader settings. Throws if title not in library. */
export function saveReaderSettings(
	sourceId: string,
	workId: string,
	settings: { direction?: string | null; offset?: string | number | null; coverArtMode?: string | null },
): void {
	const entry = db.select({ id: library.id })
		.from(library)
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.get();

	if (!entry) throw new Error('Title not in library');

	const updates: Record<string, string | null> = {};
	if (settings.direction !== undefined) updates.readerDirection = settings.direction ?? null;
	if (settings.offset !== undefined) updates.readerOffset = settings.offset === null ? null : String(settings.offset);
	if (settings.coverArtMode !== undefined) updates.coverArtMode = settings.coverArtMode ?? null;

	if (Object.keys(updates).length > 0) {
		db.update(library).set(updates).where(eq(library.id, entry.id)).run();
	}
}
