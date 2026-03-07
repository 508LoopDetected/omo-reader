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
		onclick: (e: MouseEvent) => void;
	}

	let { chapter, href, sourceId, workId, read, inProgress, progress, variantCount, selected, onclick }: Props = $props();
</script>

<button
	class="grid-card"
	class:is-read={read}
	class:selected
	data-tilt-hover
	{onclick}
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
			<a
				{href}
				class="read-action"
				onclick={(e) => e.stopPropagation()}
			>
				{inProgress ? 'Continue' : 'Read'}
			</a>
		{/snippet}
	</CoverImage>
	<div class="grid-title">{chapter.title}</div>
</button>

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
		bottom: 28px;
		right: 4px;
		background: rgb(var(--color-surface-800) / 0.85);
		font-size: 0.6rem;
	}

	.read-action {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 4px 0;
		background: rgb(var(--color-primary-500) / 0.9);
		color: #fff;
		font-size: 0.7rem;
		font-weight: 600;
		text-align: center;
		text-decoration: none;
		opacity: 0;
		transform: translateY(4px);
		transition: opacity var(--transition-fast), transform var(--transition-fast);
	}

	.grid-card:hover .read-action {
		opacity: 1;
		transform: translateY(0);
	}

	.read-action:hover {
		background: rgb(var(--color-primary-500));
	}

	.grid-title {
		font-size: 0.78rem;
		font-weight: 500;
		color: rgb(var(--color-surface-400));
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
</style>
