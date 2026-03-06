/**
 * Settings service — app settings, local paths, SMB connections, extension repos, reset.
 */

import { db } from '../db/client.js';
import {
	appSettings,
	localLibraryPaths,
	smbConnections,
	extensionRepos,
	library,
	chapters,
	readingProgress,
	collectionItems,
} from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { removeClient } from '../sources/smb/smb-client.js';
import { resetDatabase } from '../db/client.js';
import { clearAllCaches } from '../sources/manager.js';
import { clearAll as clearThumbnails } from '../thumbnails/thumbnail-cache.js';

// ── App Settings ──

/** Get all app settings as a key-value object. */
export function getAppSettings(): Record<string, string> {
	const rows = db.select().from(appSettings).all();
	const settings: Record<string, string> = {};
	for (const row of rows) {
		if (row.value !== null) settings[row.key] = row.value;
	}
	return settings;
}

/** Save app settings (upsert). */
export function saveAppSettings(settings: Record<string, string>): void {
	for (const [key, value] of Object.entries(settings)) {
		const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
		if (existing) {
			db.update(appSettings).set({ value }).where(eq(appSettings.key, key)).run();
		} else {
			db.insert(appSettings).values({ key, value }).run();
		}
	}
}

// ── Local Library Paths ──

/** Get all configured local library paths. */
export function getLocalPaths() {
	return db.select().from(localLibraryPaths).all();
}

/** Add a new local library path. Returns the new id. */
export function addLocalPath(opts: {
	path: string;
	label?: string;
	sourceType?: string;
}): number | bigint {
	const inserted = db.insert(localLibraryPaths).values({
		path: opts.path,
		label: opts.label,
		sourceType: opts.sourceType ?? 'manga',
	}).returning({ id: localLibraryPaths.id }).get();
	return inserted!.id;
}

/** Update a local library path. */
export function updateLocalPath(
	id: number,
	updates: { label?: string; sourceType?: string },
): void {
	const setObj: Record<string, unknown> = {};
	if (updates.label !== undefined) setObj.label = updates.label;
	if (updates.sourceType !== undefined) setObj.sourceType = updates.sourceType;

	if (Object.keys(setObj).length > 0) {
		db.update(localLibraryPaths).set(setObj).where(eq(localLibraryPaths.id, id)).run();
	}
}

/** Delete a local library path and cascade-clean all related data. Returns removed title count. */
export function deleteLocalPath(id: number): number {
	const sourceId = `local:${id}`;
	return deleteSourceData(sourceId, () => {
		db.delete(localLibraryPaths).where(eq(localLibraryPaths.id, id)).run();
	});
}

// ── SMB Connections ──

/** Get all SMB connections with passwords redacted. */
export function getSmbConnections() {
	const rows = db.select().from(smbConnections).all();
	return rows.map((r) => ({
		id: r.id,
		label: r.label,
		host: r.host,
		share: r.share,
		path: r.path,
		domain: r.domain,
		username: r.username,
		password: '••••••••',
		enabled: r.enabled,
		sourceType: r.sourceType,
		createdAt: r.createdAt,
	}));
}

/** Add a new SMB connection. Returns the generated id. */
export function addSmbConnection(opts: {
	label: string;
	host: string;
	share: string;
	path?: string;
	domain?: string;
	username: string;
	password: string;
	sourceType?: string;
}): string {
	const id = crypto.randomUUID();
	db.insert(smbConnections).values({
		id,
		label: opts.label,
		host: opts.host,
		share: opts.share,
		path: opts.path ?? '',
		domain: opts.domain ?? '',
		username: opts.username,
		password: opts.password,
		sourceType: opts.sourceType ?? 'manga',
	}).run();
	return id;
}

/** Update an SMB connection. Evicts cached client on changes. */
export function updateSmbConnection(
	id: string,
	updates: {
		label?: string;
		host?: string;
		share?: string;
		path?: string;
		domain?: string;
		username?: string;
		password?: string;
		enabled?: boolean;
		sourceType?: string;
	},
): void {
	const setObj: Record<string, unknown> = {};
	if (updates.label !== undefined) setObj.label = updates.label;
	if (updates.host !== undefined) setObj.host = updates.host;
	if (updates.share !== undefined) setObj.share = updates.share;
	if (updates.path !== undefined) setObj.path = updates.path;
	if (updates.domain !== undefined) setObj.domain = updates.domain;
	if (updates.username !== undefined) setObj.username = updates.username;
	if (updates.password !== undefined && updates.password !== '••••••••') setObj.password = updates.password;
	if (updates.enabled !== undefined) setObj.enabled = updates.enabled;
	if (updates.sourceType !== undefined) setObj.sourceType = updates.sourceType;

	if (Object.keys(setObj).length > 0) {
		db.update(smbConnections).set(setObj).where(eq(smbConnections.id, id)).run();
		removeClient(id);
	}
}

/** Delete an SMB connection and cascade-clean all related data. Returns removed title count. */
export function deleteSmbConnection(id: string): number {
	const sourceId = `smb:${id}`;
	return deleteSourceData(sourceId, () => {
		db.delete(smbConnections).where(eq(smbConnections.id, id)).run();
		removeClient(id);
	});
}

// ── Extension Repos ──

/** Get all extension repositories. */
export function getExtensionRepos() {
	return db.select().from(extensionRepos).all();
}

/** Add an extension repository. Returns the new id. */
export function addExtensionRepo(name: string, url: string): number | bigint {
	const inserted = db.insert(extensionRepos).values({ name, url, enabled: true }).returning({ id: extensionRepos.id }).get();
	return inserted!.id;
}

/** Delete an extension repository. */
export function deleteExtensionRepo(id: number): void {
	db.delete(extensionRepos).where(eq(extensionRepos.id, id)).run();
}

// ── Reset ──

/** Wipe all user data, clear all caches. */
export async function resetAll(): Promise<void> {
	resetDatabase();
	clearAllCaches();
	await clearThumbnails();
}

// ── Internal helpers ──

/**
 * Delete all library items, chapters, reading progress, and collection items
 * for a given sourceId, then run a cleanup callback (e.g. delete the config row).
 * Returns the number of removed library items.
 */
function deleteSourceData(sourceId: string, cleanup: () => void): number {
	const items = db.select({ id: library.id }).from(library).where(eq(library.sourceId, sourceId)).all();
	const itemIds = items.map((i) => i.id);
	if (itemIds.length > 0) {
		db.delete(collectionItems).where(inArray(collectionItems.libraryItemId, itemIds)).run();
	}

	db.delete(library).where(eq(library.sourceId, sourceId)).run();
	db.delete(chapters).where(eq(chapters.sourceId, sourceId)).run();
	db.delete(readingProgress).where(eq(readingProgress.sourceId, sourceId)).run();

	cleanup();
	return items.length;
}
