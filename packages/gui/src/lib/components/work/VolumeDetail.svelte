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

	$effect(() => {
		selectedVariantId = chapter.id;
	});

	let readerHref = $derived(
		`/work/${sourceId}/${encodeURIComponent(workId)}/${encodeURIComponent(selectedChapter.id)}`
	);

	let meta = $derived(selectedChapter.metadata);
	let hasCredits = $derived(!!(meta?.writer || meta?.penciller));
	let hasDetails = $derived(!!(meta?.publisher || meta?.year || meta?.genre));
</script>

<div class="volume-panel">
	<div class="panel-scroll">
		<div class="panel-header">
			<div class="panel-cover">
				<CoverImage
					url={selectedChapter.coverUrl}
					{sourceId}
					{workId}
					alt={selectedChapter.title}
					loading="eager"
					tilt
					fallbackChar={selectedChapter.title.charAt(0)}
				/>
			</div>

			<div class="panel-meta">
				<h3 class="panel-title">{selectedChapter.title}</h3>

				{#if hasCredits}
					<div class="credits">
						{#if meta?.writer}
							<p class="credit"><span class="credit-label">Writer</span> {meta.writer}</p>
						{/if}
						{#if meta?.penciller}
							<p class="credit"><span class="credit-label">Artist</span> {meta.penciller}</p>
						{/if}
					</div>
				{/if}

				<div class="panel-info">
					{#if selectedChapter.pageCount}
						<span class="info-item">{selectedChapter.pageCount} pages</span>
					{/if}
					{#if meta?.year}
						<span class="info-item">{meta.year}</span>
					{/if}
					{#if meta?.publisher}
						<span class="info-item">{meta.publisher}</span>
					{/if}
					{#if inProgress && progress}
						<span class="info-item progress">p.{progress.page + 1}/{progress.totalPages}</span>
					{:else if read}
						<span class="info-item read-mark">Read</span>
					{/if}
				</div>

				{#if meta?.genre}
					<div class="genre-tags">
						{#each meta.genre.split(',').map(g => g.trim()).filter(Boolean) as genre}
							<span class="genre-tag">{genre}</span>
						{/each}
					</div>
				{/if}

				{#if meta?.summary}
					<p class="summary">{meta.summary}</p>
				{/if}

				<a href={readerHref} class="btn btn-sm read-btn {inProgress ? 'preset-gradient-primary-tertiary' : 'preset-filled-primary-500'}">
					{inProgress ? 'Continue' : 'Read'}
				</a>
			</div>
		</div>

		{#if allVariants.length > 1}
			<div class="panel-section">
				<VariantSelector
					variants={allVariants}
					selected={selectedVariantId}
					onselect={(id) => selectedVariantId = id}
				/>
			</div>
		{/if}

		{#if selectedChapter.internalChapters && selectedChapter.internalChapters.length > 0}
			<div class="panel-section">
				<h5 class="section-label">Chapters</h5>
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
	</div>
</div>

<style>
	.volume-panel {
		min-width: 0;
	}

	.panel-scroll {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.panel-header {
		display: flex;
		gap: 16px;
		margin-bottom: 12px;
	}

	.panel-cover {
		width: 240px;
		flex-shrink: 0;
	}

	.panel-meta {
		flex: 1;
		min-width: 0;
	}

	.panel-title {
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 6px;
		line-height: 1.3;
	}

	.panel-info {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		margin-bottom: 8px;
	}

	.info-item {
		font-size: 0.72rem;
		color: rgb(var(--color-surface-500));
	}

	.info-item.progress {
		color: rgb(var(--color-primary-500));
	}

	.info-item.read-mark {
		color: rgb(var(--color-success-500));
	}

	.credits {
		margin-bottom: 8px;
	}

	.credit {
		font-size: 0.78rem;
		margin: 0;
		line-height: 1.5;
	}

	.credit-label {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgb(var(--color-surface-500));
		margin-right: 4px;
	}

	.genre-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		margin-bottom: 8px;
	}

	.genre-tag {
		font-size: 0.65rem;
		padding: 1px 6px;
		border-radius: 3px;
		background: color-mix(in oklch, var(--layer-sunken) 60%, transparent);
		color: rgb(var(--color-surface-500));
	}

	.summary {
		font-size: 0.76rem;
		line-height: 1.55;
		color: rgb(var(--color-surface-500));
		margin: 0 0 10px;
		max-height: 120px;
		overflow-y: auto;
		-webkit-mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
		mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
	}

	.read-btn {
		display: block;
		width: 100%;
		text-align: center;
		margin-top: 4px;
	}

	.panel-section {
		margin-top: 14px;
	}

	.section-label {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: rgb(var(--color-surface-500));
		margin: 0 0 4px;
	}

	.internal-chapter {
		display: flex;
		justify-content: space-between;
		padding: 6px 8px;
		border-radius: 6px;
		font-size: 0.78rem;
		text-decoration: none !important;
		color: inherit !important;
		transition: background var(--transition-fast);
	}

	.internal-chapter:hover {
		background: color-mix(in oklch, var(--layer-border) 25%, transparent);
	}

	.internal-page {
		font-size: 0.68rem;
		color: rgb(var(--color-surface-500));
	}
</style>
