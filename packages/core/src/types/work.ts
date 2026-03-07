export interface Source {
	id: string;
	name: string;
	lang: string;
	type: 'local' | 'native' | 'extension' | 'smb';
	iconUrl?: string;
	baseUrl?: string;
	connected?: boolean;
}

export interface WorkEntry {
	id: string;
	sourceId: string;
	title: string;
	coverUrl?: string;
	url: string;
	author?: string;
	artist?: string;
	description?: string;
	genres?: string[];
	status?: 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
	nsfw?: boolean;
	posterUrl?: string;
	bannerUrl?: string;
	logoUrl?: string;
	iconUrl?: string;
	metadata?: {
		publisher?: string;
		year?: number;
		language?: string;
		isManga?: boolean;
	};
}

export interface Chapter {
	id: string;
	workId: string;
	sourceId: string;
	title: string;
	chapterNumber?: number;
	url: string;
	dateUploaded?: number;
	scanlator?: string;
	pageCount?: number;
	coverUrl?: string;
	section?: string;
	volumeNumber?: number;
	variant?: string;
	internalChapters?: { title: string; pageIndex: number }[];
}

export interface Page {
	index: number;
	url: string;
	width?: number;
	height?: number;
}

export interface ReadingProgress {
	workId: string;
	sourceId: string;
	chapterId: string;
	page: number;
	totalPages: number;
	updatedAt: number;
}

export interface PaginatedResult<T> {
	items: T[];
	hasNextPage: boolean;
	page: number;
}

export type ReaderMode = 'spread' | 'single' | 'vertical';
export type ReadingDirection = 'rtl' | 'ltr';
export type CoverArtMode = 'none' | 'auto' | 'offset' | 'offset2';

export type LibraryType = 'manga' | 'western' | 'webcomic';

export interface UserLibrary {
	id: string;
	name: string;
	type: LibraryType;
	sortOrder: number;
	nsfw?: boolean;
	readerDirection?: string | null;
	readerOffset?: string | null;
	coverArtMode?: string | null;
}

export interface Collection {
	id: string;
	name: string;
	sortOrder: number;
	readerDirection?: string | null;
	readerOffset?: string | null;
	coverArtMode?: string | null;
}
