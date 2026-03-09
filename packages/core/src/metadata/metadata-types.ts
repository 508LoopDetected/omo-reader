/** Shared types for online metadata providers. */

export type MetadataProvider = 'mangaupdates' | 'anilist' | 'comicvine';

export interface OnlineMetadata {
	provider: MetadataProvider;
	providerId: string;
	title: string | null;
	altTitles: string[] | null;
	author: string | null;
	artist: string | null;
	description: string | null;
	genres: string[] | null;
	status: string | null;
	publisher: string | null;
	year: number | null;
	coverUrl: string | null;
	bannerUrl: string | null;
	communityScore: number | null;
	externalUrl: string | null;
	rawData: string;
	fetchedAt: number;
	manualLink: boolean;
}

export interface MetadataSearchResult {
	providerId: string;
	title: string;
	altTitles: string[];
	year: number | null;
	coverUrl: string | null;
	description: string | null;
	status: string | null;
}

export interface StoredOnlineMetadata extends OnlineMetadata {
	id: number;
	sourceId: string;
	workId: string;
}

/** Per-field preference for local vs online metadata. */
export type MetadataFieldSource = 'local' | 'online';

/** Per-work overrides: which source to use for each metadata field. */
export interface MetadataOverrides {
	author?: MetadataFieldSource;
	artist?: MetadataFieldSource;
	description?: MetadataFieldSource;
	genres?: MetadataFieldSource;
	status?: MetadataFieldSource;
	coverUrl?: MetadataFieldSource;
}
