/**
 * Tracker service — reading session time tracking per work.
 *
 * Tracks cumulative reading time with start/pause/complete semantics.
 * Time accumulates in `trackedSeconds`; when active, `activeAt` marks the
 * current session start so elapsed = trackedSeconds + (now - activeAt).
 */

import { db } from '../db/client.js';
import { readingTracker } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export interface TrackerState {
	status: 'active' | 'paused' | 'completed';
	trackedSeconds: number;
	activeAt: string | null; // ISO string when active, null otherwise
	startedAt: string | null;
	completedAt: string | null;
}

function toState(row: typeof readingTracker.$inferSelect): TrackerState {
	return {
		status: row.status as TrackerState['status'],
		trackedSeconds: row.trackedSeconds,
		activeAt: row.activeAt?.toISOString() ?? null,
		startedAt: row.startedAt?.toISOString() ?? null,
		completedAt: row.completedAt?.toISOString() ?? null,
	};
}

function findTracker(sourceId: string, workId: string) {
	return db
		.select()
		.from(readingTracker)
		.where(and(eq(readingTracker.sourceId, sourceId), eq(readingTracker.workId, workId)))
		.get();
}

/** Get current tracker state for a work, or null if no tracker exists. */
export function getTracker(sourceId: string, workId: string): TrackerState | null {
	const row = findTracker(sourceId, workId);
	return row ? toState(row) : null;
}

/** Start or resume tracking for a work. Creates tracker if none exists. */
export function startTracking(sourceId: string, workId: string): TrackerState {
	const existing = findTracker(sourceId, workId);
	const now = new Date();

	if (!existing) {
		db.insert(readingTracker)
			.values({ sourceId, workId, status: 'active', trackedSeconds: 0, activeAt: now, startedAt: now })
			.run();
		return { status: 'active', trackedSeconds: 0, activeAt: now.toISOString(), startedAt: now.toISOString(), completedAt: null };
	}

	if (existing.status === 'active') {
		return toState(existing); // already active
	}

	// Resume from paused or completed
	db.update(readingTracker)
		.set({ status: 'active', activeAt: now, completedAt: null })
		.where(eq(readingTracker.id, existing.id))
		.run();

	return { ...toState(existing), status: 'active', activeAt: now.toISOString(), completedAt: null };
}

/** Pause tracking — accumulates elapsed time into trackedSeconds. */
export function pauseTracking(sourceId: string, workId: string): TrackerState | null {
	const existing = findTracker(sourceId, workId);
	if (!existing) return null;
	if (existing.status !== 'active') return toState(existing);

	const elapsed = existing.activeAt ? Math.floor((Date.now() - existing.activeAt.getTime()) / 1000) : 0;
	const newTracked = existing.trackedSeconds + Math.max(0, elapsed);

	db.update(readingTracker)
		.set({ status: 'paused', trackedSeconds: newTracked, activeAt: null })
		.where(eq(readingTracker.id, existing.id))
		.run();

	return { status: 'paused', trackedSeconds: newTracked, activeAt: null, startedAt: existing.startedAt?.toISOString() ?? null, completedAt: null };
}

/** Complete tracking — accumulates remaining time, marks as completed. */
export function completeTracking(sourceId: string, workId: string): TrackerState | null {
	const existing = findTracker(sourceId, workId);
	if (!existing) return null;
	if (existing.status === 'completed') return toState(existing);

	const now = new Date();
	const elapsed = existing.status === 'active' && existing.activeAt
		? Math.floor((now.getTime() - existing.activeAt.getTime()) / 1000) : 0;
	const newTracked = existing.trackedSeconds + Math.max(0, elapsed);

	db.update(readingTracker)
		.set({ status: 'completed', trackedSeconds: newTracked, activeAt: null, completedAt: now })
		.where(eq(readingTracker.id, existing.id))
		.run();

	return { status: 'completed', trackedSeconds: newTracked, activeAt: null, startedAt: existing.startedAt?.toISOString() ?? null, completedAt: now.toISOString() };
}

/** Delete tracker for a work entirely. */
export function deleteTracker(sourceId: string, workId: string): void {
	db.delete(readingTracker)
		.where(and(eq(readingTracker.sourceId, sourceId), eq(readingTracker.workId, workId)))
		.run();
}
