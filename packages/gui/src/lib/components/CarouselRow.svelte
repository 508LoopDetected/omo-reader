<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		count,
		titleClass = '',
		children,
	}: {
		title: string;
		count?: number;
		titleClass?: string;
		children: Snippet;
	} = $props();

	let track: HTMLDivElement;
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);

	function updateArrows() {
		if (!track) return;
		canScrollLeft = track.scrollLeft > 2;
		canScrollRight = track.scrollLeft + track.clientWidth < track.scrollWidth - 2;
	}

	function scrollBy(dir: -1 | 1) {
		if (!track) return;
		track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: 'smooth' });
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') { scrollBy(-1); e.preventDefault(); }
		if (e.key === 'ArrowRight') { scrollBy(1); e.preventDefault(); }
	}

	$effect(() => {
		if (!track) return;
		updateArrows();
		const ro = new ResizeObserver(updateArrows);
		ro.observe(track);
		return () => ro.disconnect();
	});
</script>

<div class="carousel-section">
	<div class="flex items-center gap-2 mb-3 pb-2 border-b border-surface-200-800">
		<h3 class="text-base font-semibold {titleClass === 'muted' ? 'text-surface-500' : ''}">{title}</h3>
		{#if count !== undefined}
			<span class="badge preset-tonal-surface text-xs">{count}</span>
		{/if}
	</div>

	<div class="carousel-container">
		{#if canScrollLeft}
			<button class="carousel-arrow carousel-arrow-left" onclick={() => scrollBy(-1)} aria-label="Scroll left">
				<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
			</button>
		{/if}
		{#if canScrollRight}
			<button class="carousel-arrow carousel-arrow-right" onclick={() => scrollBy(1)} aria-label="Scroll right">
				<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
			</button>
		{/if}

		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="carousel-track"
			bind:this={track}
			onscroll={updateArrows}
			onkeydown={handleKeydown}
			tabindex="0"
			role="region"
			aria-label="{title} carousel"
		>
			{@render children()}
		</div>

		<div class="carousel-fade-left" class:visible={canScrollLeft}></div>
		<div class="carousel-fade-right" class:visible={canScrollRight}></div>
	</div>
</div>

<style>
	.carousel-section {
		margin-bottom: 1.5rem;
	}

	.carousel-container {
		position: relative;
		margin: 0 -8px;
	}

	.carousel-track {
		display: flex;
		gap: 1rem;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scroll-padding-left: 8px;
		padding: 8px 8px;
		-ms-overflow-style: none;
		scrollbar-width: none;
		outline: none;
	}

	.carousel-track::-webkit-scrollbar {
		display: none;
	}

	.carousel-track :global(> *) {
		scroll-snap-align: start;
		flex-shrink: 0;
		width: var(--card-width, 160px);
	}

	/* ── Arrow buttons ── */

	.carousel-arrow {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		z-index: 5;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.65);
		color: #fff;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.2s, background 0.15s;
		backdrop-filter: blur(8px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.carousel-container:hover .carousel-arrow {
		opacity: 1;
	}

	.carousel-arrow:hover {
		background: rgba(0, 0, 0, 0.85);
	}

	.carousel-arrow-left {
		left: 4px;
	}

	.carousel-arrow-right {
		right: 4px;
	}

	/* ── Edge fade gradients ── */

	.carousel-fade-left,
	.carousel-fade-right {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 40px;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s;
		z-index: 3;
	}

	.carousel-fade-left {
		left: 0;
		background: linear-gradient(to right, var(--body-bg, var(--color-surface-950)), transparent);
	}

	.carousel-fade-right {
		right: 0;
		background: linear-gradient(to left, var(--body-bg, var(--color-surface-950)), transparent);
	}

	.carousel-fade-left.visible,
	.carousel-fade-right.visible {
		opacity: 1;
	}

	/* ── Hide arrows on touch devices ── */
	@media (hover: none) {
		.carousel-arrow {
			display: none;
		}
	}
</style>
