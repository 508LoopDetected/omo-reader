/**
 * User libraries service — CRUD for user-defined library categories.
 */

import { db } from '../db/client.js';
import { userLibraries, library } from '../db/schema.js';
import { eq } from 'drizzle-orm';

type LibraryType = 'manga' | 'western' | 'webcomic';
const VALID_TYPES: LibraryType[] = ['manga', 'western', 'webcomic'];

/** Get all user libraries ordered by sortOrder. */
export function getAllUserLibraries() {
	return db.select().from(userLibraries).orderBy(userLibraries.sortOrder).all();
}

/** Create a new user library. Returns the generated id. Throws on invalid type. */
export function createUserLibrary(name: string, type: string): string {
	if (!VALID_TYPES.includes(type as LibraryType)) {
		throw new Error('Invalid type. Must be manga, western, or webcomic');
	}

	const id = crypto.randomUUID();
	const maxOrder = db.select({ sortOrder: userLibraries.sortOrder })
		.from(userLibraries).orderBy(userLibraries.sortOrder).all();
	const nextOrder = maxOrder.length > 0 ? Math.max(...maxOrder.map((r) => r.sortOrder)) + 1 : 0;

	db.insert(userLibraries).values({ id, name, type: type as LibraryType, sortOrder: nextOrder }).run();
	return id;
}

/** Update a user library's fields. Throws on invalid type. */
export function updateUserLibrary(
	id: string,
	updates: {
		name?: string;
		type?: string;
		sortOrder?: number;
		readerDirection?: string | null;
		readerOffset?: string | null;
		coverArtMode?: string | null;
		nsfw?: boolean;
	},
): void {
	if (updates.type !== undefined && !VALID_TYPES.includes(updates.type as LibraryType)) {
		throw new Error('Invalid type');
	}

	const setObj: Record<string, unknown> = {};
	if (updates.name !== undefined) setObj.name = updates.name;
	if (updates.type !== undefined) setObj.type = updates.type;
	if (updates.sortOrder !== undefined) setObj.sortOrder = updates.sortOrder;
	if (updates.readerDirection !== undefined) setObj.readerDirection = updates.readerDirection;
	if (updates.readerOffset !== undefined) setObj.readerOffset = updates.readerOffset;
	if (updates.coverArtMode !== undefined) setObj.coverArtMode = updates.coverArtMode;
	if (updates.nsfw !== undefined) setObj.nsfw = updates.nsfw;

	if (Object.keys(setObj).length > 0) {
		db.update(userLibraries).set(setObj).where(eq(userLibraries.id, id)).run();
	}
}

/** Delete a user library. Orphans library items by setting their libraryId to null. */
export function deleteUserLibrary(id: string): void {
	db.update(library).set({ libraryId: null }).where(eq(library.libraryId, id)).run();
	db.delete(userLibraries).where(eq(userLibraries.id, id)).run();
}
