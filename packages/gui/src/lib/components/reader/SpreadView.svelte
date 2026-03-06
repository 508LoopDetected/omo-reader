<script lang="ts">
	import PageImage from './PageImage.svelte';
	import { computeSpreads, findSpreadForPage } from '$lib/stores/reader.js';
	import type { Page, ReadingDirection } from '@omo/core';

	interface Props {
		pages: Page[];
		currentPage: number;
		direction: ReadingDirection;
		offset: boolean;
		onPageChange: (page: number) => void;
		onToggleControls: () => void;
	}

	let { pages, currentPage, direction, offset, onPageChange, onToggleControls }: Props = $props();

	let pageDimensions = $state(new Map<number, { width: number; height: number }>());
	let spreads = $derived(computeSpreads(pages, offset, pageDimensions));
	let currentSpread = $derived(findSpreadForPage(spreads, currentPage));
	let currentSpreadPages = $derived(spreads[currentSpread] ?? []);

	// Preload adjacent spreads
	$effect(() => {
		const preloadRange = 2;
		for (let i = currentSpread - preloadRange; i <= currentSpread + preloadRange; i++) {
			if (i >= 0 && i < spreads.length && i !== currentSpread) {
				for (const pageIdx of spreads[i]) {
					const img = new Image();
					img.src = pages[pageIdx].url;
				}
			}
		}
	});

	function goNext() {
		if (currentSpread < spreads.length - 1) {
			const nextSpread = spreads[currentSpread + 1];
			onPageChange(nextSpread[0]);
		}
	}

	function goPrev() {
		if (currentSpread > 0) {
			const prevSpread = spreads[currentSpread - 1];
			onPageChange(prevSpread[0]);
		}
	}

	function handleClick(e: MouseEvent) {
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const third = rect.width / 3;

		if (x < third) {
			// Left third
			direction === 'rtl' ? goNext() : goPrev();
		} else if (x > third * 2) {
			// Right third
			direction === 'rtl' ? goPrev() : goNext();
		} else {
			// Center third - toggle controls
			onToggleControls();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault();
				direction === 'rtl' ? goNext() : goPrev();
				break;
			case 'ArrowRight':
				e.preventDefault();
				direction === 'rtl' ? goPrev() : goNext();
				break;
			case 'ArrowUp':
			case 'PageUp':
				e.preventDefault();
				goPrev();
				break;
			case 'ArrowDown':
			case 'PageDown':
			case ' ':
				e.preventDefault();
				goNext();
				break;
		}
	}

	function handleWheel(e: WheelEvent) {
		if (Math.abs(e.deltaY) < 10) return;
		e.preventDefault();
		if (e.deltaY > 0) goNext();
		else goPrev();
	}

	// Touch/swipe handling
	let touchStartX = 0;
	let touchStartY = 0;
	let touchStartTime = 0;

	function handleTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		touchStartTime = Date.now();
	}

	function handleTouchEnd(e: TouchEvent) {
		if (e.changedTouches.length !== 1) return;
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		const dt = Date.now() - touchStartTime;

		// Must be a quick swipe (< 300ms) with sufficient horizontal movement
		if (dt > 300 || Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) {
			// Tap detection: short touch with minimal movement
			if (dt < 200 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
				const target = e.currentTarget as HTMLElement;
				const rect = target.getBoundingClientRect();
				const x = e.changedTouches[0].clientX - rect.left;
				const third = rect.width / 3;
				if (x < third) {
					direction === 'rtl' ? goNext() : goPrev();
				} else if (x > third * 2) {
					direction === 'rtl' ? goPrev() : goNext();
				} else {
					onToggleControls();
				}
			}
			return;
		}

		// Swipe left or right
		if (dx < 0) {
			// Swipe left
			direction === 'rtl' ? goPrev() : goNext();
		} else {
			// Swipe right
			direction === 'rtl' ? goNext() : goPrev();
		}
	}

	function handleDimensionsLoaded(pageIndex: number, dims: { width: number; height: number }) {
		pageDimensions = new Map(pageDimensions.set(pageIndex, dims));
	}

	// Order pages for display based on reading direction
	function displayOrder(pageIndices: number[]): number[] {
		if (pageIndices.length <= 1) return pageIndices;
		return direction === 'rtl' ? [...pageIndices].reverse() : pageIndices;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="spread-view" onclick={handleClick} onwheel={handleWheel} ontouchstart={handleTouchStart} ontouchend={handleTouchEnd}>
	<div class="spread-container" class:single={currentSpreadPages.length === 1}>
		{#each displayOrder(currentSpreadPages) as pageIdx (pageIdx)}
			<PageImage
				src={pages[pageIdx].url}
				alt="Page {pageIdx + 1}"
				onLoad={(dims) => handleDimensionsLoaded(pageIdx, dims)}
				class="spread-page"
			/>
		{/each}
	</div>

	<div class="page-indicator">
		{#if currentSpreadPages.length === 2}
			{currentSpreadPages[0] + 1}-{currentSpreadPages[1] + 1}
		{:else if currentSpreadPages.length === 1}
			{currentSpreadPages[0] + 1}
		{/if}
		/ {pages.length}
	</div>
</div>

<style>
	.spread-view {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #000;
		cursor: pointer;
		overflow: hidden;
		position: relative;
	}

	.spread-container {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 2px;
		max-width: 100%;
	}

	.spread-container :global(.spread-page) {
		flex: 0 1 50%;
		max-width: 50%;
	}

	.spread-container.single :global(.spread-page) {
		flex: 0 1 100%;
		max-width: 100%;
	}

	.page-indicator {
		position: absolute;
		bottom: 8px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.7);
		color: #aaa;
		padding: 4px 12px;
		border-radius: 4px;
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
		pointer-events: none;
		user-select: none;
	}
</style>
