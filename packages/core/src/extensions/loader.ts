/**
 * Extension loader — fetches the Mangayomi extension index,
 * filters to JS-only manga extensions, and downloads/caches
 * extension source code in SQLite.
 */

import { db } from '../db/client.js';
import { sources, extensionRepos } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const DEFAULT_REPO_URL = 'https://kodjodevf.github.io/mangayomi-extensions/index.json';

interface IndexEntry {
	name: string;
	id: number;
	baseUrl: string;
	lang: string;
	typeSource: string;
	iconUrl: string;
	sourceCodeUrl: string;
	apiUrl: string;
	version: string;
	isManga: boolean;
	itemType: number;
	isNsfw: boolean;
	hasCloudflare: boolean;
	isFullData: boolean;
	dateFormat: string;
	dateFormatLocale: string;
	appMinVerReq: string;
	additionalParams: string;
	sourceCodeLanguage: number; // 0 = Dart, 1 = JavaScript
	notes: string;
}

export interface AvailableExtension {
	id: string;
	name: string;
	lang: string;
	baseUrl: string;
	iconUrl: string;
	version: string;
	sourceCodeUrl: string;
	apiUrl: string;
	isNsfw: boolean;
	hasCloudflare: boolean;
	isFullData: boolean;
	dateFormat: string;
	dateFormatLocale: string;
	additionalParams: string;
	notes: string;
	installed: boolean;
}

/**
 * Fetch the extension index from all configured repos.
 * Returns only JS manga extensions.
 */
export async function fetchExtensionIndex(): Promise<AvailableExtension[]> {
	const repos = db.select().from(extensionRepos).where(eq(extensionRepos.enabled, true)).all();

	// Add default repo if none configured
	const repoUrls = repos.length > 0
		? repos.map((r) => r.url)
		: [DEFAULT_REPO_URL];

	const allExtensions: AvailableExtension[] = [];
	const installedIds = new Set(
		db.select({ id: sources.id }).from(sources).where(eq(sources.type, 'extension')).all().map((s) => s.id)
	);

	for (const repoUrl of repoUrls) {
		try {
			const res = await fetch(repoUrl, {
				headers: { 'User-Agent': 'MangaReader/1.0' },
			});
			if (!res.ok) {
				console.error(`Failed to fetch index from ${repoUrl}: ${res.status}`);
				continue;
			}

			const entries: IndexEntry[] = await res.json();

			for (const entry of entries) {
				// Filter: JS only, manga only
				if (entry.sourceCodeLanguage !== 1) continue;
				if (entry.itemType !== 0 && entry.isManga !== true) continue;
				if (!entry.sourceCodeUrl) continue;

				const id = String(entry.id);
				allExtensions.push({
					id,
					name: entry.name,
					lang: entry.lang,
					baseUrl: entry.baseUrl,
					iconUrl: entry.iconUrl,
					version: entry.version,
					sourceCodeUrl: entry.sourceCodeUrl,
					apiUrl: entry.apiUrl ?? '',
					isNsfw: entry.isNsfw,
					hasCloudflare: entry.hasCloudflare,
					isFullData: entry.isFullData ?? false,
					dateFormat: entry.dateFormat ?? '',
					dateFormatLocale: entry.dateFormatLocale ?? '',
					additionalParams: entry.additionalParams ?? '',
					notes: entry.notes ?? '',
					installed: installedIds.has(id),
				});
			}
		} catch (err) {
			console.error(`Error fetching extension index from ${repoUrl}:`, err);
		}
	}

	return allExtensions;
}

/**
 * Install an extension by downloading its JS source and saving to DB.
 */
export async function installExtension(ext: AvailableExtension): Promise<void> {
	// Download the JS source code
	const res = await fetch(ext.sourceCodeUrl, {
		headers: { 'User-Agent': 'MangaReader/1.0' },
	});
	if (!res.ok) {
		throw new Error(`Failed to download extension: ${res.status} ${res.statusText}`);
	}
	const jsCode = await res.text();

	// Upsert into sources table
	const existing = db.select().from(sources).where(eq(sources.id, ext.id)).get();

	if (existing) {
		db.update(sources)
			.set({
				name: ext.name,
				lang: ext.lang,
				baseUrl: ext.baseUrl,
				iconUrl: ext.iconUrl,
				jsCode,
				version: ext.version,
				enabled: true,
			})
			.where(eq(sources.id, ext.id))
			.run();
	} else {
		db.insert(sources)
			.values({
				id: ext.id,
				name: ext.name,
				lang: ext.lang,
				type: 'extension',
				baseUrl: ext.baseUrl,
				iconUrl: ext.iconUrl,
				jsCode,
				version: ext.version,
				enabled: true,
			})
			.run();
	}
}

/**
 * Uninstall (remove) an extension from the DB.
 */
export async function uninstallExtension(sourceId: string): Promise<void> {
	db.delete(sources).where(eq(sources.id, sourceId)).run();
}

/**
 * Get all installed extension sources.
 */
export function getInstalledExtensions() {
	return db.select().from(sources).where(eq(sources.type, 'extension')).all();
}

/**
 * Get a single installed extension by ID.
 */
export function getExtensionById(sourceId: string) {
	return db.select().from(sources).where(eq(sources.id, sourceId)).get();
}
