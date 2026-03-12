/**
 * Collections service — CRUD for collections and collection membership.
 */

import { db } from '../db/client.js';
import { collections, collectionItems, library } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';

/** Get all collections ordered by sortOrder. */
export function getAllCollections() {
	return db.select().from(collections).orderBy(collections.sortOrder).all();
}

/** Create a new collection. Returns the generated id. */
export function createCollection(name: string): string {
	const id = crypto.randomUUID();
	const existing = db.select({ sortOrder: collections.sortOrder })
		.from(collections)
		.orderBy(collections.sortOrder)
		.all();
	const nextOrder = existing.length > 0 ? Math.max(...existing.map((r) => r.sortOrder)) + 1 : 0;

	db.insert(collections).values({ id, name, sortOrder: nextOrder }).run();
	return id;
}

/** Update a collection's fields. */
export function updateCollection(
	id: string,
	updates: {
		name?: string;
		sortOrder?: number;
		readerDirection?: string | null;
		readerOffset?: string | null;
		coverArtMode?: string | null;
	},
): void {
	const setObj: Record<string, unknown> = {};
	if (updates.name !== undefined) setObj.name = updates.name;
	if (updates.sortOrder !== undefined) setObj.sortOrder = updates.sortOrder;
	if (updates.readerDirection !== undefined) setObj.readerDirection = updates.readerDirection;
	if (updates.readerOffset !== undefined) setObj.readerOffset = updates.readerOffset;
	if (updates.coverArtMode !== undefined) setObj.coverArtMode = updates.coverArtMode;

	if (Object.keys(setObj).length > 0) {
		db.update(collections).set(setObj).where(eq(collections.id, id)).run();
	}
}

/** Delete a collection and all its item memberships. */
export function deleteCollection(id: string): void {
	db.delete(collectionItems).where(eq(collectionItems.collectionId, id)).run();
	db.delete(collections).where(eq(collections.id, id)).run();
}

/** Get raw (non-enriched) collection items with library data. */
export function getCollectionItemsRaw(collectionId: string) {
	return db.select({
		libraryItemId: collectionItems.libraryItemId,
		sourceId: library.sourceId,
		workId: library.workId,
		title: library.title,
		coverUrl: library.coverUrl,
		url: library.url,
		author: library.author,
		status: library.status,
		nsfw: library.nsfw,
		lastReadAt: library.lastReadAt,
		addedAt: library.addedAt,
		libraryId: library.libraryId,
	})
		.from(collectionItems)
		.innerJoin(library, eq(collectionItems.libraryItemId, library.id))
		.where(eq(collectionItems.collectionId, collectionId))
		.all();
}

/** Get all collection memberships (collectionId → libraryItemId mapping). */
export function getAllCollectionMemberships() {
	return db.select({
		collectionId: collectionItems.collectionId,
		libraryItemId: collectionItems.libraryItemId,
	})
		.from(collectionItems)
		.all();
}

/** Get all collection memberships for items in a given library. */
export function getCollectionItemsByLibrary(libraryId: string) {
	return db.select({
		collectionId: collectionItems.collectionId,
		libraryItemId: collectionItems.libraryItemId,
	})
		.from(collectionItems)
		.innerJoin(library, eq(collectionItems.libraryItemId, library.id))
		.where(eq(library.libraryId, libraryId))
		.all();
}

/** Get collection IDs that a work belongs to. */
export function getCollectionIdsForWork(sourceId: string, workId: string): string[] {
	const libEntry = db.select({ id: library.id })
		.from(library)
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.get();
	if (!libEntry) return [];

	const rows = db.select({ collectionId: collectionItems.collectionId })
		.from(collectionItems)
		.where(eq(collectionItems.libraryItemId, libEntry.id))
		.all();
	return rows.map((r) => r.collectionId);
}

/** Add a library title to a collection. Throws if title not in library. */
export function addToCollection(collectionId: string, sourceId: string, workId: string): void {
	const libEntry = db.select({ id: library.id })
		.from(library)
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.get();

	if (!libEntry) throw new Error('Title not in library');

	const existing = db.select({ id: collectionItems.id })
		.from(collectionItems)
		.where(and(
			eq(collectionItems.collectionId, collectionId),
			eq(collectionItems.libraryItemId, libEntry.id),
		))
		.get();

	if (!existing) {
		db.insert(collectionItems).values({
			collectionId,
			libraryItemId: libEntry.id,
		}).run();
	}
}

/** Remove a library title from a collection. */
export function removeFromCollection(collectionId: string, sourceId: string, workId: string): void {
	const libEntry = db.select({ id: library.id })
		.from(library)
		.where(and(eq(library.sourceId, sourceId), eq(library.workId, workId)))
		.get();

	if (libEntry) {
		db.delete(collectionItems)
			.where(and(
				eq(collectionItems.collectionId, collectionId),
				eq(collectionItems.libraryItemId, libEntry.id),
			))
			.run();
	}
}
