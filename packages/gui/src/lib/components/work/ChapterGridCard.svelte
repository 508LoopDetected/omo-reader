<script lang="ts">
	import CoverImage from '$lib/components/CoverImage.svelte';
	import type { Chapter } from '@omo/core';

	interface Props {
		chapter: Chapter;
		variants?: Chapter[];
		href: string;
		sourceId: string;
		workId: string;
		read: boolean;
		inProgress: boolean;
		progress?: { page: number; totalPages: number };
		selected?: boolean;
		showGridText?: boolean;
		onclick: (e: MouseEvent) => void;
		onVariantChange?: (chapter: Chapter) => void;
	}

	let { chapter, variants = [], href, sourceId, workId, read, inProgress, progress, selected, showGridText = true, onclick, onVariantChange }: Props = $props();

	let activeIndex = $state(0);
	let hasVariants = $derived(variants.length > 1);
	let activeChapter = $derived(hasVariants ? variants[activeIndex] ?? chapter : chapter);
	let activeHref = $derived(
		hasVariants
			? `/work/${sourceId}/${encodeURIComponent(workId)}/${encodeURIComponent(activeChapter.id)}`
			: href
	);

	function cycleVariant(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		activeIndex = (activeIndex + 1) % variants.length;
		onVariantChange?.(variants[activeIndex]);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="grid-card"
	class:is-read={read}
	class:selected
	class:has-variants={hasVariants}
	data-tilt-hover
	onclick={onclick}
>
	<div class="cover-stack">
		{#if hasVariants}
			{@const bgVariant = variants[(activeIndex + 1) % variants.length]}
			<div class="stack-behind">
				<CoverImage url={bgVariant.coverUrl} {sourceId} {workId} alt="" fallbackChar="" />
			</div>
		{/if}
		<div class="stack-front">
			{#if hasVariants}
				{#each variants as v, i}
					<div class="crossfade-layer" class:active={i === activeIndex} class:base={i === 0}>
						<CoverImage url={v.coverUrl} {sourceId} {workId} alt={v.title} fallbackChar={v.title.charAt(0)} />
					</div>
				{/each}
			{:else}
				<CoverImage url={chapter.coverUrl} {sourceId} {workId} alt={chapter.title} fallbackChar={chapter.title.charAt(0)} />
			{/if}
			<div class="cover-overlay">
				{#if read}
					<div class="grid-badge read-badge">
						<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
					</div>
				{:else if inProgress && progress}
					<div class="grid-badge progress-badge">
						p.{progress.page + 1}/{progress.totalPages}
					</div>
				{/if}
				<div class="action-bar">
					<button
						class="action-half action-info"
						onclick={(e) => { e.stopPropagation(); onclick(e); }}
					>
						<span class="info-i">i</span>
					</button>
					<a
						href={activeHref}
						class="action-half action-read"
						onclick={(e) => e.stopPropagation()}
					>
						<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
					</a>
				</div>
				{#if hasVariants}
					<div class="action-bar-bottom">
						<button
							class="action-half action-variant"
							onclick={cycleVariant}
						>
							<span class="variant-v">V</span>
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
	{#if showGridText}
		<div class="grid-title">
			{activeChapter.title}
			{#if hasVariants && activeChapter.variant}
				<span class="variant-label">{activeChapter.variant}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.grid-card {
		display: block;
		text-decoration: none;
		color: inherit;
		transition: transform var(--transition-spring), opacity var(--transition-fast);
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}

	.grid-card:hover {
		transform: translateY(-4px) scale(1.015);
	}

	.grid-card:hover :global(.cover-image) {
		box-shadow: var(--shadow-overlay);
	}

	.grid-card:active {
		transform: translateY(-1px) scale(0.99);
		transition-duration: 0.1s;
	}

	.grid-card.is-read { opacity: 0.5; }

	/* ── Stacked covers ── */

	.cover-stack {
		position: relative;
	}

	.grid-card.has-variants .cover-stack {
		margin-top: 8px;
		margin-right: 8px;
	}

	.stack-front {
		position: relative;
		z-index: 1;
		overflow: hidden;
		border-radius: 3px;
	}

	.stack-behind {
		position: absolute;
		top: -8px;
		right: -8px;
		left: 8px;
		bottom: 8px;
		z-index: 0;
		border-radius: 3px;
		overflow: hidden;
		pointer-events: none;
	}

	.stack-behind :global(.cover-image) {
		box-shadow: none !important;
	}

	/* ── Crossfade layers ── */

	.crossfade-layer {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}

	.crossfade-layer.base {
		position: relative;
		opacity: 0;
	}

	.crossfade-layer.active {
		opacity: 1;
		pointer-events: auto;
	}

	.cover-overlay {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
	}

	.cover-overlay > * {
		pointer-events: auto;
	}

	/* ── Badges ── */

	.grid-badge {
		position: absolute;
		top: 4px;
		right: 4px;
		padding: 2px 5px;
		border-radius: 3px;
		font-size: 0.65rem;
		font-weight: 600;
		line-height: 1.3;
		color: #fff;
	}

	.read-badge {
		background: var(--color-success-500);
		display: flex;
		align-items: center;
		padding: 3px;
	}

	.progress-badge {
		background: var(--color-primary-500);
		font-variant-numeric: tabular-nums;
	}

	/* ── Action buttons ── */

	.action-bar {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		left: 0;
		right: 0;
		display: flex;
		justify-content: space-between;
		pointer-events: none;
	}

	.action-bar-bottom {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.action-half {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		font-size: 0.7rem;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		pointer-events: auto;
		opacity: 0;
		transition: opacity var(--transition-fast), transform var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
	}

	.grid-card:hover .action-half {
		opacity: 1;
	}

	.action-info {
		background: color-mix(in oklch, var(--color-surface-950) 80%, transparent);
		color: var(--color-surface-50);
		border-radius: 0 50% 50% 0;
		margin-left: -6px;
		transform: translateX(-10px);
	}

	.grid-card:hover .action-info {
		transform: translateX(0);
	}

	.action-read {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
		border-radius: 50% 0 0 50%;
		margin-right: -6px;
		transform: translateX(10px);
	}

	.grid-card:hover .action-read {
		transform: translateX(0);
	}

	.action-read:hover {
		background-color: var(--color-surface-950);
		color: var(--color-surface-50);
	}

	.action-variant {
		background: var(--color-secondary-500);
		color: var(--color-secondary-contrast-500);
		border-radius: 50% 50% 0 0;
		margin-bottom: -6px;
		transform: translateY(10px);
	}

	.grid-card:hover .action-variant {
		transform: translateY(0);
	}

	.action-variant:hover {
		background-color: var(--color-surface-950);
		color: var(--color-surface-50);
	}

	.info-i {
		font-style: italic;
		font-weight: 700;
		font-size: 1.1rem;
		font-family: Georgia, serif;
		line-height: 1;
	}

	.variant-v {
		font-weight: 700;
		font-size: 0.85rem;
		font-family: Georgia, serif;
		line-height: 1;
	}

	.action-info:hover {
		background-color: var(--color-surface-950);
		color: var(--color-surface-50);
	}

	/* ── Title ── */

	.grid-title {
		font-size: 0.78rem;
		font-weight: 500;
		color: inherit;
		line-height: 1.4;
		margin-top: 8px;
		padding: 0 2px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.variant-label {
		color: var(--color-secondary-500);
		font-size: 0.7rem;
		font-weight: 600;
	}
</style>
