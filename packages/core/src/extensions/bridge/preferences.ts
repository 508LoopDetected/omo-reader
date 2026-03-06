/**
 * SharedPreferences bridge for Mangayomi extensions.
 * Backed by SQLite source_preferences table.
 *
 * Values are stored as JSON strings and parsed on read.
 * When a key doesn't exist, returns null (extensions should handle defaults).
 *
 * Extension usage:
 *   const prefs = new SharedPreferences();
 *   prefs.get(key)                      -> parsed value or null
 *   prefs.getString(key, defaultValue)   -> string
 *   prefs.setString(key, value)          -> void
 */

import { db } from '../../db/client.js';
import { sourcePreferences } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';

export function createSharedPreferencesClass(sourceId: string) {
	return class SharedPreferences {
		get(key: string): unknown {
			const row = db.select()
				.from(sourcePreferences)
				.where(and(
					eq(sourcePreferences.sourceId, sourceId),
					eq(sourcePreferences.key, key),
				))
				.get();

			if (!row || row.value === null || row.value === undefined) {
				// Return empty array for keys that look like list preferences
				// This matches Mangayomi behavior where multiSelectListPreference
				// defaults to an empty array
				return [];
			}

			// Try JSON-parsing (values may be arrays, objects, etc.)
			try {
				return JSON.parse(row.value);
			} catch {
				return row.value;
			}
		}

		getString(key: string, defaultValue: string): string {
			const row = db.select()
				.from(sourcePreferences)
				.where(and(
					eq(sourcePreferences.sourceId, sourceId),
					eq(sourcePreferences.key, key),
				))
				.get();

			if (!row || row.value === null || row.value === undefined) {
				return defaultValue;
			}

			return row.value;
		}

		setString(key: string, value: string): void {
			const serialized = typeof value === 'string' ? value : JSON.stringify(value);
			const existing = db.select()
				.from(sourcePreferences)
				.where(and(
					eq(sourcePreferences.sourceId, sourceId),
					eq(sourcePreferences.key, key),
				))
				.get();

			if (existing) {
				db.update(sourcePreferences)
					.set({ value: serialized })
					.where(eq(sourcePreferences.id, existing.id))
					.run();
			} else {
				db.insert(sourcePreferences)
					.values({ sourceId, key, value: serialized })
					.run();
			}
		}
	};
}
