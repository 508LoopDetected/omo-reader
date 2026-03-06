<script lang="ts">
	import PageImage from './PageImage.svelte';

	type ReadingDirection = 'ltr' | 'rtl';

	interface Page {
		url: string;
	}

	interface Props {
		pages: Page[];
		currentPage: number;
		direction: ReadingDirection;
		onPageChange: (page: number) => void;
		onToggleControls: () => void;
	}

	let { pages, currentPage, direction, onPageChange, onToggleControls }: Props = $props();

	// Preload adjacent pages
	$effect(() => {
		for (let i = currentPage - 1; i <= currentPage + 2; i++) {
			if (i >= 0 && i < pages.length && i !== currentPage) {
				const img = new Image();
				img.src = pages[i].url;
			}
		}
	});

	function goNext() {
		if (currentPage < pages.length - 1) onPageChange(currentPage + 1);
	}

	function goPrev() {
		if (currentPage > 0) onPageChange(currentPage - 1);
	}

	function handleClick(e: MouseEvent) {
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const third = rect.width / 3;

		if (x < third) {
			direction === 'rtl' ? goNext() : goPrev();
		} else if (x > third * 2) {
			direction === 'rtl' ? goPrev() : goNext();
		} else {
			onToggleControls();
		}
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

		if (dt > 300 || Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) {
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

		if (dx < 0) {
			direction === 'rtl' ? goPrev() : goNext();
		} else {
			direction === 'rtl' ? goNext() : goPrev();
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
			case ' ':
			case 'ArrowDown':
			case 'PageDown':
				e.preventDefault();
				goNext();
				break;
			case 'ArrowUp':
			case 'PageUp':
				e.preventDefault();
				goPrev();
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="single-view" onclick={handleClick} ontouchstart={handleTouchStart} ontouchend={handleTouchEnd}>
	{#if pages[currentPage]}
		<PageImage src={pages[currentPage].url} alt="Page {currentPage + 1}" />
	{/if}

	<div class="page-indicator">
		{currentPage + 1} / {pages.length}
	</div>
</div>

<style>
	.single-view {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #000;
		cursor: pointer;
		position: relative;
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
	}
</style>
