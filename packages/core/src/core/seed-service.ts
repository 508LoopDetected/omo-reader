/**
 * Seed service — generate fake reader activity data for UI testing.
 *
 * Works with whatever titles are already in the library, generating:
 * - Reading progress using real chapter IDs (completion ring + continue reading)
 * - Reading activity heatmap data (GitHub-style calendar on work detail)
 * - Title ratings (star ratings on work detail)
 *
 * Fetches real chapters from sources so progress records match actual chapter IDs.
 */

import { db } from '../db/client.js';
import { library, readingProgress, readingActivity, titleRatings, readingTracker } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getDetail } from '../sources/manager.js';

// ── Helpers ──

function rand(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chance(pct: number): boolean {
	return Math.random() < pct;
}

function daysAgo(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d.toISOString().slice(0, 10);
}

function timestampDaysAgo(n: number): Date {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d;
}

// ── Main ──

export interface SeedResult {
	titlesProcessed: number;
	progressRecords: number;
	activityRecords: number;
	ratingsCreated: number;
	trackersCreated: number;
}

/**
 * Populate the database with realistic reader activity for all library items.
 * Fetches real chapter lists from sources so progress records use correct IDs.
 */
export async function generateActivityData(): Promise<SeedResult> {
	const items = db.select({
		id: library.id,
		sourceId: library.sourceId,
		workId: library.workId,
		title: library.title,
	}).from(library).all();

	if (items.length === 0) {
		return { titlesProcessed: 0, progressRecords: 0, activityRecords: 0, ratingsCreated: 0 };
	}

	let progressRecords = 0;
	let activityRecords = 0;
	let ratingsCreated = 0;
	let trackersCreated = 0;

	for (const item of items) {
		// Fetch real chapters from the source
		let realChapters: { id: string; chapterNumber?: number | null }[];
		try {
			const detail = await getDetail(item.sourceId, item.workId, item.title);
			realChapters = detail.chapters;
		} catch {
			// Source unavailable — skip this title
			continue;
		}

		if (realChapters.length === 0) continue;

		// Sort by chapter number ascending
		realChapters.sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));

		// Most titles: read some fraction of chapters, all completed.
		// A few titles: actively mid-chapter (shows in Continue Reading).
		const titleIndex = items.indexOf(item);
		const shouldBeInProgress = titleIndex < 4;

		// How far the reader has gotten (20-100% of chapters)
		const readFraction = 0.2 + Math.random() * 0.8;
		const chaptersReadCount = Math.max(1, Math.floor(realChapters.length * readFraction));
		const readChapters = realChapters.slice(0, chaptersReadCount);

		// Timeline: started reading N days ago
		const startDay = shouldBeInProgress ? rand(1, 30) : rand(14, 300);
		const timeline = generateTimeline(startDay, chaptersReadCount);

		for (let i = 0; i < readChapters.length; i++) {
			const ch = readChapters[i];
			const totalPages = rand(18, 45);
			const isLast = i === readChapters.length - 1;
			// Only the few in-progress titles have a partially-read last chapter
			const isPartial = isLast && shouldBeInProgress;
			const page = isPartial ? rand(1, Math.max(2, totalPages - 3)) : totalPages - 1;

			const dayIndex = timeline[Math.min(i, timeline.length - 1)];
			const updatedAt = timestampDaysAgo(dayIndex);

			const existing = db.select({ id: readingProgress.id })
				.from(readingProgress)
				.where(and(
					eq(readingProgress.sourceId, item.sourceId),
					eq(readingProgress.workId, item.workId),
					eq(readingProgress.chapterId, ch.id),
				))
				.get();

			if (existing) {
				db.update(readingProgress)
					.set({ page, totalPages, updatedAt, dismissed: false })
					.where(eq(readingProgress.id, existing.id))
					.run();
			} else {
				db.insert(readingProgress)
					.values({
						sourceId: item.sourceId,
						workId: item.workId,
						chapterId: ch.id,
						page,
						totalPages,
						updatedAt,
						dismissed: false,
					})
					.run();
			}
			progressRecords++;
		}

		// Heatmap activity data
		activityRecords += generateHeatmapData(item.sourceId, item.workId, startDay, timeline);

		// Update lastReadAt on library entry
		const mostRecentDay = Math.min(...timeline);
		db.update(library)
			.set({ lastReadAt: timestampDaysAgo(mostRecentDay) })
			.where(eq(library.id, item.id))
			.run();

		// 70% chance of rating
		if (chance(0.7)) {
			const rating = generateRating();
			const existing = db.select({ id: titleRatings.id })
				.from(titleRatings)
				.where(and(eq(titleRatings.sourceId, item.sourceId), eq(titleRatings.workId, item.workId)))
				.get();

			if (existing) {
				db.update(titleRatings)
					.set({ rating, updatedAt: new Date() })
					.where(eq(titleRatings.id, existing.id))
					.run();
			} else {
				db.insert(titleRatings)
					.values({ sourceId: item.sourceId, workId: item.workId, rating })
					.run();
			}
			ratingsCreated++;
		}

		// 60% chance of having a tracker
		if (chance(0.6)) {
			const startDay = Math.max(...timeline);
			const started = timestampDaysAgo(startDay);
			const totalSec = rand(600, 14400); // 10min to 4hrs
			const isComplete = !shouldBeInProgress && chance(0.5);
			const isPaused = !isComplete && !shouldBeInProgress && chance(0.5);

			const existing = db.select({ id: readingTracker.id })
				.from(readingTracker)
				.where(and(eq(readingTracker.sourceId, item.sourceId), eq(readingTracker.workId, item.workId)))
				.get();

			const status = isComplete ? 'completed' : isPaused ? 'paused' : 'active';
			const values = {
				sourceId: item.sourceId,
				workId: item.workId,
				status,
				trackedSeconds: status === 'active' ? totalSec - rand(60, 600) : totalSec,
				activeAt: status === 'active' ? timestampDaysAgo(rand(0, 1)) : null,
				startedAt: started,
				completedAt: isComplete ? timestampDaysAgo(rand(0, 7)) : null,
			};

			if (existing) {
				db.update(readingTracker).set(values).where(eq(readingTracker.id, existing.id)).run();
			} else {
				db.insert(readingTracker).values(values).run();
			}
			trackersCreated++;
		}
	}

	return { titlesProcessed: items.length, progressRecords, activityRecords, ratingsCreated, trackersCreated };
}

/**
 * Clear all activity data (progress, heatmap, ratings).
 * Does NOT remove library items.
 */
export function clearActivityData(): { cleared: boolean } {
	db.delete(readingProgress).run();
	db.delete(readingActivity).run();
	db.delete(titleRatings).run();
	db.delete(readingTracker).run();
	db.update(library).set({ lastReadAt: null }).run();
	return { cleared: true };
}

// ── Data Generation ──

/** Simulate reading timeline with binge sessions and gaps. */
function generateTimeline(startDay: number, count: number): number[] {
	const days: number[] = [];
	let current = startDay;

	for (let i = 0; i < count; i++) {
		days.push(Math.max(0, current));

		if (chance(0.4)) {
			current -= rand(0, 1); // binge
		} else if (chance(0.3)) {
			current -= rand(1, 3); // steady
		} else {
			current -= rand(3, 14); // gap
		}
		current = Math.max(0, current);
	}

	return days;
}

/** Generate heatmap entries with varied daily page counts. */
function generateHeatmapData(
	sourceId: string,
	workId: string,
	_startDay: number,
	timeline: number[],
): number {
	let records = 0;
	const activeDays = new Set(timeline);

	// Sprinkle extra active days
	const maxDay = Math.max(...timeline);
	const minDay = Math.min(...timeline);
	const span = maxDay - minDay;
	const extras = rand(3, Math.max(5, Math.floor(span * 0.3)));
	for (let i = 0; i < extras; i++) {
		activeDays.add(rand(minDay, maxDay));
	}

	for (const day of activeDays) {
		const date = daysAgo(day);
		const pagesRead = chance(0.3) ? rand(1, 8) : rand(10, 60);

		const existing = db.select({ id: readingActivity.id })
			.from(readingActivity)
			.where(and(
				eq(readingActivity.sourceId, sourceId),
				eq(readingActivity.workId, workId),
				eq(readingActivity.date, date),
			))
			.get();

		if (existing) {
			db.update(readingActivity)
				.set({ pagesRead })
				.where(eq(readingActivity.id, existing.id))
				.run();
		} else {
			db.insert(readingActivity)
				.values({ sourceId, workId, date, pagesRead })
				.run();
		}
		records++;
	}

	return records;
}

/** Rating biased toward higher values (bell curve ~7). */
function generateRating(): number {
	const base = 7 + (Math.random() + Math.random() + Math.random() - 1.5) * 3;
	return Math.max(1, Math.min(10, Math.round(base)));
}
