/**
 * Stats service — title ratings and reading activity tracking.
 */

import { db } from '../db/client.js';
import { titleRatings, readingActivity } from '../db/schema.js';
import { eq, and, gte, sql } from 'drizzle-orm';

// ── Ratings ──

/** Get the user's rating for a work (0-10 scale), or null if unrated. */
export function getRating(sourceId: string, workId: string): number | null {
	const row = db
		.select({ rating: titleRatings.rating })
		.from(titleRatings)
		.where(and(eq(titleRatings.sourceId, sourceId), eq(titleRatings.workId, workId)))
		.get();
	return row?.rating ?? null;
}

/** Set or update the user's rating for a work (0-10 scale). */
export function setRating(sourceId: string, workId: string, rating: number): void {
	const clamped = Math.max(0, Math.min(10, Math.round(rating)));
	const existing = db
		.select({ id: titleRatings.id })
		.from(titleRatings)
		.where(and(eq(titleRatings.sourceId, sourceId), eq(titleRatings.workId, workId)))
		.get();

	if (existing) {
		db.update(titleRatings)
			.set({ rating: clamped, updatedAt: new Date() })
			.where(eq(titleRatings.id, existing.id))
			.run();
	} else {
		db.insert(titleRatings)
			.values({ sourceId, workId, rating: clamped })
			.run();
	}
}

/** Remove the user's rating for a work. */
export function deleteRating(sourceId: string, workId: string): void {
	db.delete(titleRatings)
		.where(and(eq(titleRatings.sourceId, sourceId), eq(titleRatings.workId, workId)))
		.run();
}

// ── Reading Activity ──

/** Log a page-read event for today. Upserts the daily counter. */
export function logActivity(sourceId: string, workId: string): void {
	const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
	const existing = db
		.select({ id: readingActivity.id, pagesRead: readingActivity.pagesRead })
		.from(readingActivity)
		.where(
			and(
				eq(readingActivity.sourceId, sourceId),
				eq(readingActivity.workId, workId),
				eq(readingActivity.date, today),
			),
		)
		.get();

	if (existing) {
		db.update(readingActivity)
			.set({ pagesRead: existing.pagesRead + 1 })
			.where(eq(readingActivity.id, existing.id))
			.run();
	} else {
		db.insert(readingActivity)
			.values({ sourceId, workId, date: today, pagesRead: 1 })
			.run();
	}
}

/**
 * Get daily reading activity for a work over the last N days.
 * Returns sparse array (only days with activity).
 */
export function getWorkActivity(
	sourceId: string,
	workId: string,
	days: number = 365,
): { date: string; pagesRead: number }[] {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffStr = cutoff.toISOString().slice(0, 10);

	return db
		.select({ date: readingActivity.date, pagesRead: readingActivity.pagesRead })
		.from(readingActivity)
		.where(
			and(
				eq(readingActivity.sourceId, sourceId),
				eq(readingActivity.workId, workId),
				gte(readingActivity.date, cutoffStr),
			),
		)
		.all();
}

/**
 * Get global daily reading activity (all works) over the last N days.
 * Aggregates pages_read across all works per day.
 */
export function getGlobalActivity(
	days: number = 365,
): { date: string; pagesRead: number }[] {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffStr = cutoff.toISOString().slice(0, 10);

	return db
		.select({
			date: readingActivity.date,
			pagesRead: sql<number>`SUM(${readingActivity.pagesRead})`,
		})
		.from(readingActivity)
		.where(gte(readingActivity.date, cutoffStr))
		.groupBy(readingActivity.date)
		.all();
}
