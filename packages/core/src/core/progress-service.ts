/**
 * Progress service — reading progress CRUD operations.
 */

import { db } from '../db/client.js';
import { readingProgress, library } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

/** Get progress for a specific chapter. */
export function getChapterProgress(sourceId: string, workId: string, chapterId: string) {
	return db
		.select()
		.from(readingProgress)
		.where(
			and(
				eq(readingProgress.sourceId, sourceId),
				eq(readingProgress.workId, workId),
				eq(readingProgress.chapterId, chapterId),
			),
		)
		.get() ?? null;
}

/** Get all chapter progress for a work. */
export function getWorkProgress(sourceId: string, workId: string) {
	return db
		.select()
		.from(readingProgress)
		.where(
			and(
				eq(readingProgress.sourceId, sourceId),
				eq(readingProgress.workId, workId),
			),
		)
		.all();
}

/** Get recent non-dismissed progress for library items (continue reading). */
export function getRecentProgress(limit: number = 20) {
	return db
		.select({
			id: readingProgress.id,
			sourceId: readingProgress.sourceId,
			workId: readingProgress.workId,
			chapterId: readingProgress.chapterId,
			page: readingProgress.page,
			totalPages: readingProgress.totalPages,
			updatedAt: readingProgress.updatedAt,
		})
		.from(readingProgress)
		.innerJoin(
			library,
			and(
				eq(readingProgress.sourceId, library.sourceId),
				eq(readingProgress.workId, library.workId),
			),
		)
		.where(eq(readingProgress.dismissed, false))
		.orderBy(desc(readingProgress.updatedAt))
		.limit(limit)
		.all();
}

/**
 * Save reading progress for a chapter (upsert).
 * Only tracks progress for items already in library.
 * Returns { success, skipped? }.
 */
export function saveProgress(
	sourceId: string,
	workId: string,
	chapterId: string,
	page: number,
	totalPages: number,
): { success: boolean; skipped?: boolean } {
	const inLibrary = db
		.select({ id: library.id })
		.from(library)
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.get();

	if (!inLibrary) {
		return { success: true, skipped: true };
	}

	const existing = db
		.select()
		.from(readingProgress)
		.where(
			and(
				eq(readingProgress.sourceId, sourceId),
				eq(readingProgress.workId, workId),
				eq(readingProgress.chapterId, chapterId),
			),
		)
		.get();

	if (existing) {
		db.update(readingProgress)
			.set({ page, totalPages, updatedAt: new Date(), dismissed: false })
			.where(eq(readingProgress.id, existing.id))
			.run();
	} else {
		db.insert(readingProgress)
			.values({ sourceId, workId, chapterId, page, totalPages, dismissed: false })
			.run();
	}

	// Un-dismiss all progress rows for this work (reading resumes the whole title)
	db.update(readingProgress)
		.set({ dismissed: false })
		.where(
			and(
				eq(readingProgress.sourceId, sourceId),
				eq(readingProgress.workId, workId),
				eq(readingProgress.dismissed, true),
			),
		)
		.run();

	// Update library lastReadAt
	db.update(library)
		.set({ lastReadAt: new Date() })
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.run();

	return { success: true };
}

/** Dismiss a work from "Continue Reading" (keeps progress). */
export function dismissWork(sourceId: string, workId: string) {
	db.update(readingProgress)
		.set({ dismissed: true })
		.where(
			and(
				eq(readingProgress.sourceId, sourceId),
				eq(readingProgress.workId, workId),
			),
		)
		.run();
}

/** Reset all reading progress for a work. */
export function resetWorkProgress(sourceId: string, workId: string) {
	db.delete(readingProgress)
		.where(
			and(
				eq(readingProgress.sourceId, sourceId),
				eq(readingProgress.workId, workId),
			),
		)
		.run();
}

/**
 * Mark a chapter as read (upsert to last page) or unread (delete progress).
 */
export function markChapter(
	sourceId: string,
	workId: string,
	chapterId: string,
	read: boolean,
) {
	const where = and(
		eq(readingProgress.sourceId, sourceId),
		eq(readingProgress.workId, workId),
		eq(readingProgress.chapterId, chapterId),
	);

	if (read) {
		const existing = db.select().from(readingProgress).where(where).get();
		const totalPages = existing?.totalPages || 1;
		const lastPage = Math.max(totalPages - 1, 0);

		if (existing) {
			db.update(readingProgress)
				.set({ page: lastPage, totalPages, updatedAt: new Date(), dismissed: false })
				.where(eq(readingProgress.id, existing.id))
				.run();
		} else {
			db.insert(readingProgress)
				.values({ sourceId, workId, chapterId, page: lastPage, totalPages, dismissed: false })
				.run();
		}
	} else {
		db.delete(readingProgress).where(where).run();
	}
}
