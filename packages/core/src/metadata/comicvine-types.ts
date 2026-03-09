/** Comic Vine REST API response types. */

export interface ComicVineVolume {
	id: number;
	name: string;
	aliases: string | null;
	deck: string | null;
	description: string | null;
	image: {
		medium_url: string | null;
		small_url: string | null;
		original_url: string | null;
	} | null;
	publisher: { name: string } | null;
	start_year: string | null;
	count_of_issues: number | null;
	site_detail_url: string | null;
}

export interface ComicVineSearchResponse {
	error: string;
	number_of_page_results: number;
	number_of_total_results: number;
	results: ComicVineVolume[];
}

export interface ComicVineDetailResponse {
	error: string;
	results: ComicVineVolume;
}
