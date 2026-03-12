/**
 * Shared response types for OMOCore — used by API routes and TUI.
 */

import type { WorkEntry, Chapter, UserLibrary, Collection, Source } from '../types/work.js';
import type { ContinueReadingItem } from './reading.js';
import type { StoredOnlineMetadata, MetadataOverrides } from '../metadata/metadata-types.js';
import type { TrackerState } from './tracker-service.js';

export type { ContinueReadingItem };

export interface EnrichedLibraryItem {
	id: number;
	sourceId: string;
	workId: string;
	title: string;
	coverUrl: string | null;
	url: string;
	author: string | null;
	artist: string | null;
	description: string | null;
	genres: string | null;
	status: string | null;
	addedAt: Date | null;
	lastReadAt: Date | null;
	nsfw: boolean;
	libraryId: string | null;
	readerDirection: string | null;
	readerOffset: string | null;
	coverArtMode: string | null;
	unreadCount: number;
}

export interface HomeData {
	continueReading: ContinueReadingItem[];
	recentLibrary: EnrichedLibraryItem[];
}

export interface LibraryQueryOptions {
	libraryId?: string;
	sort?: 'title' | 'recent' | 'added';
	search?: string;
	nsfwMode?: string;
}

export interface CollectionQueryOptions {
	sort?: 'title' | 'recent' | 'added';
	search?: string;
	nsfwMode?: string;
}

export interface WorkCompositeData {
	work: WorkEntry;
	chapters: Chapter[];
	source: Source | null;
	inLibrary: boolean;
	libraryId: string | null;
	progressMap: Record<string, { page: number; totalPages: number }>;
	readCount: number;
	userLibraries: UserLibrary[];
	collections: Collection[];
	titleCollectionIds: string[];
	readerSettings: { direction: string | null; offset: string | null; coverArtMode: string | null };
	rating: number | null;
	readingActivity: { date: string; pagesRead: number }[];
	onlineMeta: StoredOnlineMetadata | null;
	tracker: TrackerState | null;
	metadataOverrides: MetadataOverrides | null;
	mergedFields: {
		author: string | null;
		artist: string | null;
		description: string | null;
		genres: string | null;
		status: string | null;
		coverUrl: string | null;
		bannerUrl: string | null;
		communityScore: number | null;
		externalUrl: string | null;
		year: number | null;
		publisher: string | null;
	};
}
