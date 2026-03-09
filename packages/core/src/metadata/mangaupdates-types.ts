/** MangaUpdates REST API response types. */

export interface MUImage {
	url: {
		original: string | null;
		thumb: string | null;
	};
	height: number | null;
	width: number | null;
}

export interface MUGenre {
	genre: string;
}

export interface MUAuthor {
	name: string;
	author_id: number;
	type: string; // "Author" | "Artist"
}

export interface MUPublisher {
	publisher_name: string;
	publisher_id: number;
	type: string; // "English" | "Japanese" | etc
	notes: string;
}

export interface MURelatedSeries {
	relation_type: string;
	related_series_id: number;
	related_series_name: string;
}

export interface MUSeries {
	series_id: number;
	title: string;
	url: string | null;
	associated: { title: string }[];
	description: string | null;
	image: MUImage | null;
	type: string | null;
	year: string | null;
	bayesian_rating: number | null;
	rating_votes: number | null;
	genres: MUGenre[];
	categories: { category: string; votes: number }[];
	latest_chapter: number | null;
	status: string | null;
	licensed: boolean | null;
	completed: boolean | null;
	authors: MUAuthor[];
	publishers: MUPublisher[];
	related_series: MURelatedSeries[];
	last_updated: { timestamp: number } | null;
}

/** Search result record (subset of full series). */
export interface MUSearchRecord {
	series_id: number;
	title: string;
	url: string | null;
	description: string | null;
	image: MUImage | null;
	type: string | null;
	year: string | null;
	bayesian_rating: number | null;
	rating_votes: number | null;
	genres: MUGenre[];
	last_updated: { timestamp: number } | null;
}

export interface MUSearchResponse {
	total_hits: number;
	page: number;
	per_page: number;
	results: {
		record: MUSearchRecord;
		hit_title: string;
	}[];
}
