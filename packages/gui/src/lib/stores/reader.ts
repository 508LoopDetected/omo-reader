import type { Page } from '@omo/core';

/** Compute spread pairs from pages, accounting for offset and wide pages. */
export function computeSpreads(
	pageList: Page[],
	offset: boolean,
	pageDimensions: Map<number, { width: number; height: number }>
): number[][] {
	if (pageList.length === 0) return [];

	const spreads: number[][] = [];
	let i = 0;

	// If offset is on, first page (cover) is solo
	if (offset && pageList.length > 0) {
		spreads.push([0]);
		i = 1;
	}

	while (i < pageList.length) {
		const dims = pageDimensions.get(i);
		const isWide = dims ? dims.width > dims.height : false;

		if (isWide) {
			// Wide page (double-page spread) always displays solo
			spreads.push([i]);
			i++;
		} else if (i + 1 < pageList.length) {
			const nextDims = pageDimensions.get(i + 1);
			const nextIsWide = nextDims ? nextDims.width > nextDims.height : false;

			if (nextIsWide) {
				// Next page is wide, current page goes solo
				spreads.push([i]);
				i++;
			} else {
				// Two normal pages side by side
				spreads.push([i, i + 1]);
				i += 2;
			}
		} else {
			// Last page alone
			spreads.push([i]);
			i++;
		}
	}

	return spreads;
}

/** Find which spread index contains a given page index. */
export function findSpreadForPage(spreads: number[][], pageIndex: number): number {
	for (let i = 0; i < spreads.length; i++) {
		if (spreads[i].includes(pageIndex)) return i;
	}
	return 0;
}
