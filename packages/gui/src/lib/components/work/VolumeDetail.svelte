<script lang="ts">
	import CoverImage from '$lib/components/CoverImage.svelte';
	import VariantSelector from './VariantSelector.svelte';
	import type { Chapter } from '@omo/core';

	interface Props {
		chapter: Chapter;
		allVariants: Chapter[];
		sourceId: string;
		workId: string;
		read: boolean;
		inProgress: boolean;
		progress?: { page: number; totalPages: number };
		onclose: () => void;
	}

	let { chapter, allVariants, sourceId, workId, read, inProgress, progress, onclose }: Props = $props();

	let selectedVariantId = $state(chapter.id);
	let selectedChapter = $derived(allVariants.find((v) => v.id === selectedVariantId) ?? allVariants[0] ?? chapter);

	let readerHref = $derived(
		`/work/${sourceId}/${encodeURIComponent(workId)}/${encodeURIComponent(selectedChapter.id)}`
	);
</script>

<div class="volume-detail">
	<div class="detail-layout">
		<div class="detail-cover">
			<CoverImage
				url={selectedChapter.coverUrl}
				{sourceId}
				{workId}
				alt={selectedChapter.title}
				loading="eager"
			/>
		</div>
		<div class="detail-content">
			<div class="detail-top">
				<h4 class="detail-title">{selectedChapter.title}</h4>
				<button class="close-btn" onclick={onclose} aria-label="Close">
					<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
				</button>
			</div>

			{#if selectedChapter.pageCount}
				<p class="detail-meta">{selectedChapter.pageCount} pages</p>
			{/if}

			{#if inProgress && progress}
				<p class="detail-progress">Reading progress: p.{progress.page + 1}/{progress.totalPages}</p>
			{:else if read}
				<p class="detail-read">Read</p>
			{/if}

			{#if selectedChapter.internalChapters && selectedChapter.internalChapters.length > 0}
				<div class="internal-chapters">
					<h5 class="internal-heading">Chapters</h5>
					{#each selectedChapter.internalChapters as ic}
						<a
							href="{readerHref}?page={ic.pageIndex}"
							class="internal-chapter"
						>
							{ic.title}
							<span class="internal-page">p.{ic.pageIndex + 1}</span>
						</a>
					{/each}
				</div>
			{/if}

			{#if allVariants.length > 1}
				<div class="variant-section">
					<VariantSelector
						variants={allVariants}
						selected={selectedVariantId}
						onselect={(id) => selectedVariantId = id}
					/>
				</div>
			{/if}

			<div class="detail-actions">
				<a href={readerHref} class="btn btn-sm preset-filled-primary-500">
					{inProgress ? 'Continue Reading' : 'Read'}
				</a>
			</div>
		</div>
	</div>
</div>

<style>
	.volume-detail {
		grid-column: 1 / -1;
		background: rgb(var(--color-surface-100));
		border-radius: 8px;
		padding: 16px;
		margin: 4px 0;
	}

	:global(.dark) .volume-detail {
		background: rgb(var(--color-surface-900));
	}

	.detail-layout {
		display: flex;
		gap: 20px;
	}

	.detail-cover {
		width: 160px;
		flex-shrink: 0;
	}

	.detail-content {
		flex: 1;
		min-width: 0;
	}

	.detail-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 8px;
	}

	.detail-title {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0 0 4px;
	}

	.close-btn {
		background: none;
		border: none;
		color: rgb(var(--color-surface-500));
		cursor: pointer;
		padding: 2px;
		flex-shrink: 0;
	}

	.close-btn:hover { color: rgb(var(--color-surface-800)); }
	:global(.dark) .close-btn:hover { color: rgb(var(--color-surface-200)); }

	.detail-meta {
		font-size: 0.8rem;
		color: rgb(var(--color-surface-500));
		margin: 0 0 8px;
	}

	.detail-progress {
		font-size: 0.8rem;
		color: rgb(var(--color-primary-500));
		margin: 0 0 8px;
	}

	.detail-read {
		font-size: 0.8rem;
		color: rgb(var(--color-success-500));
		margin: 0 0 8px;
	}

	.internal-chapters {
		margin: 12px 0;
	}

	.internal-heading {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: rgb(var(--color-surface-500));
		margin: 0 0 6px;
	}

	.internal-chapter {
		display: flex;
		justify-content: space-between;
		padding: 6px 8px;
		border-radius: 4px;
		font-size: 0.8rem;
		text-decoration: none !important;
		color: inherit !important;
		transition: background 0.15s;
	}

	.internal-chapter:hover { background: rgba(128,128,128,0.1); }

	.internal-page {
		font-size: 0.7rem;
		color: rgb(var(--color-surface-500));
	}

	.variant-section {
		margin: 12px 0;
	}

	.detail-actions {
		margin-top: 12px;
	}

	@media (max-width: 600px) {
		.detail-layout { flex-direction: column; align-items: center; text-align: center; }
		.detail-cover { width: 120px; }
	}
</style>
