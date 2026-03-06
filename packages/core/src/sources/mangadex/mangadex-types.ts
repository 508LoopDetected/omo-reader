/** TypeScript types for MangaDex API v5 responses. */

export interface MangaDexLocalizedString {
	[lang: string]: string;
}

export interface MangaDexRelationship {
	id: string;
	type: string;
	attributes?: Record<string, unknown>;
}

export interface MangaDexTag {
	id: string;
	type: 'tag';
	attributes: {
		name: MangaDexLocalizedString;
		group: string;
	};
}

export interface MangaDexMangaAttributes {
	title: MangaDexLocalizedString;
	altTitles: MangaDexLocalizedString[];
	description: MangaDexLocalizedString;
	status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
	year: number | null;
	contentRating: string;
	tags: MangaDexTag[];
	originalLanguage: string;
	lastChapter: string | null;
	lastVolume: string | null;
}

export interface MangaDexManga {
	id: string;
	type: 'manga';
	attributes: MangaDexMangaAttributes;
	relationships: MangaDexRelationship[];
}

export interface MangaDexChapterAttributes {
	title: string | null;
	volume: string | null;
	chapter: string | null;
	pages: number;
	translatedLanguage: string;
	publishAt: string;
	readableAt: string;
	externalUrl: string | null;
}

export interface MangaDexChapter {
	id: string;
	type: 'chapter';
	attributes: MangaDexChapterAttributes;
	relationships: MangaDexRelationship[];
}

export interface MangaDexPaginatedResponse<T> {
	result: string;
	response: string;
	data: T[];
	limit: number;
	offset: number;
	total: number;
}

export interface MangaDexEntityResponse<T> {
	result: string;
	response: string;
	data: T;
}

export interface MangaDexAtHomeResponse {
	result: string;
	baseUrl: string;
	chapter: {
		hash: string;
		data: string[];
		dataSaver: string[];
	};
}
