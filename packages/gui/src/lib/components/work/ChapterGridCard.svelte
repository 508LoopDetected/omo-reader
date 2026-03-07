<script lang="ts">
	import CoverImage from '$lib/components/CoverImage.svelte';
	import type { Chapter } from '@omo/core';

	interface Props {
		chapter: Chapter;
		href: string;
		sourceId: string;
		workId: string;
		read: boolean;
		inProgress: boolean;
		progress?: { page: number; totalPages: number };
		variantCount?: number;
		selected?: boolean;
		onclick?: (e: MouseEvent) => void;
	}

	let { chapter, href, sourceId, workId, read, inProgress, progress, variantCount, selected, onclick }: Props = $props();
</script>

{#if onclick}
	<button
		class="grid-card"
		class:is-read={read}
		class:selected
		data-tilt-hover
		onclick={onclick}
	>
		<CoverImage url={chapter.coverUrl} {sourceId} {workId} alt={chapter.title} fallbackChar={chapter.title.charAt(0)}>
			{#snippet overlay()}
				{#if read}
					<div class="grid-badge read-badge">
						<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
					</div>
				{:else if inProgress && progress}
					<div class="grid-badge progress-badge">
						p.{progress.page + 1}/{progress.totalPages}
					</div>
				{/if}
				{#if variantCount && variantCount > 1}
					<div class="grid-badge variant-badge">
						{variantCount} versions
					</div>
				{/if}
			{/snippet}
		</CoverImage>
		<div class="grid-title">{chapter.title}</div>
	</button>
{:else}
	<a
		{href}
		class="grid-card"
		class:is-read={read}
		data-tilt-hover
	>
		<CoverImage url={chapter.coverUrl} {sourceId} {workId} alt={chapter.title} fallbackChar={chapter.title.charAt(0)}>
			{#snippet overlay()}
				{#if read}
					<div class="grid-badge read-badge">
						<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
					</div>
				{:else if inProgress && progress}
					<div class="grid-badge progress-badge">
						p.{progress.page + 1}/{progress.totalPages}
					</div>
				{/if}
			{/snippet}
		</CoverImage>
		<div class="grid-title">{chapter.title}</div>
	</a>
{/if}

<style>
	.grid-card {
		display: block;
		text-decoration: none;
		color: inherit;
		transition: transform 0.15s;
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}

	.grid-card.is-read { opacity: 0.5; }

	.grid-card.selected {
		outline: 2px solid rgb(var(--color-primary-500));
		outline-offset: 2px;
		border-radius: 6px;
	}

	.grid-badge {
		position: absolute;
		top: 4px;
		right: 4px;
		padding: 2px 5px;
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: 600;
		line-height: 1.3;
		color: #fff;
	}

	.read-badge {
		background: rgb(var(--color-success-500));
		display: flex;
		align-items: center;
		padding: 3px;
	}

	.progress-badge {
		background: rgb(var(--color-primary-500));
		font-variant-numeric: tabular-nums;
	}

	.variant-badge {
		top: auto;
		bottom: 4px;
		right: 4px;
		background: rgb(var(--color-surface-800) / 0.85);
		font-size: 0.6rem;
	}

	.grid-title {
		font-size: 0.8rem;
		color: rgb(var(--color-surface-800));
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	:global(.dark) .grid-title {
		color: rgb(var(--color-surface-200));
	}
</style>
