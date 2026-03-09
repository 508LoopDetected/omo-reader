/** AniList GraphQL response types. */

export interface AniListMedia {
	id: number;
	title: {
		english: string | null;
		romaji: string | null;
		native: string | null;
	};
	description: string | null;
	coverImage: {
		extraLarge: string | null;
		large: string | null;
	} | null;
	bannerImage: string | null;
	genres: string[] | null;
	status: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS' | null;
	averageScore: number | null;
	startDate: { year: number | null } | null;
	synonyms: string[] | null;
	siteUrl: string | null;
	staff: {
		edges: {
			role: string;
			node: { name: { full: string | null } };
		}[];
	} | null;
}

export interface AniListSearchResponse {
	data: {
		Page: {
			media: AniListMedia[];
		};
	};
}

export interface AniListDetailResponse {
	data: {
		Media: AniListMedia;
	};
}
