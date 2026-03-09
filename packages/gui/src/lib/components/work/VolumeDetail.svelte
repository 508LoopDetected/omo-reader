<script lang="ts">
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
		selectedVariantId: string;
		onVariantChange: (chapterId: string) => void;
	}

	let { chapter, allVariants, sourceId, workId, read, inProgress, progress, selectedVariantId, onVariantChange }: Props = $props();

	let readerHref = $derived(
		`/work/${sourceId}/${encodeURIComponent(workId)}/${encodeURIComponent(chapter.id)}`
	);

	let meta = $derived(chapter.metadata);
	let hasCredits = $derived(!!(meta?.writer || meta?.penciller));

	// Mini dot progress tracker
	let totalPages = $derived(progress?.totalPages ?? chapter.pageCount ?? 0);
	let currentPage = $derived(progress?.page ?? (read ? totalPages : 0));
	let progressPct = $derived(totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0);
	let dotsOpen = $state(false);

	let readLabel = $derived.by(() => {
		const verb = inProgress ? 'Continue' : 'Read';
		if (chapter.volumeNumber != null) return `${verb} Volume ${chapter.volumeNumber}`;
		if (chapter.chapterNumber != null) return `${verb} Chapter ${chapter.chapterNumber}`;
		return `${verb} ${chapter.title}`;
	});

	// Measure available width for internal chapter titles and truncate accordingly
	let chaptersEl = $state<HTMLDivElement>();
	let maxTitleChars = $state(40);

	$effect(() => {
		if (!chaptersEl) return;
		const obs = new ResizeObserver(([entry]) => {
			const w = entry.contentRect.width;
			// ~6.5px per char at 0.7rem, minus page label (~50px) and padding
			maxTitleChars = Math.max(10, Math.floor((w - 50) / 6.5));
		});
		obs.observe(chaptersEl);
		return () => obs.disconnect();
	});

	function truncTitle(title: string): string {
		return title.length > maxTitleChars ? title.slice(0, maxTitleChars) + '…' : title;
	}
</script>

<div class="chapter-detail">
	<a href={readerHref} class="btn read-btn preset-gradient-primary-tertiary">
		<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
		{readLabel}
	</a>

	{#if totalPages > 0}
		<div class="dot-tracker">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="dot-label" onclick={() => dotsOpen = !dotsOpen}>
				<span class="dot-label-left">
					{#if read}
						<span class="dot-status read">{totalPages} Pages &middot; Complete</span>
					{:else if inProgress}
						<span class="dot-status in-progress">{totalPages} Pages &middot; p.{currentPage + 1}/{totalPages}</span>
					{:else}
						<span class="dot-status unread">{totalPages} Pages &middot; Unread</span>
					{/if}
					<span class="dot-pct">{progressPct}%</span>
				</span>
				<span class="dot-toggle">
					<svg class="dot-toggle-eye" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
					<svg class="dot-toggle-caret" class:flipped={dotsOpen} viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
				</span>
			</div>
			<div class="dot-grid-wrap" class:open={dotsOpen}>
				<div class="dot-grid">
					{#each { length: totalPages } as _, i}
						<span
							class="dot"
							class:read={i < currentPage}
							class:current={inProgress && i === currentPage}
							title="Page {i + 1}"
						></span>
					{/each}
				</div>
			</div>
		</div>
	{/if}

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

	<div class="detail-info">
		{#if meta?.year}
			<span class="info-item">{meta.year}</span>
		{/if}
		{#if meta?.publisher}
			<span class="info-item">{meta.publisher}</span>
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

	{#if allVariants.length > 1}
		<div class="detail-section">
			<VariantSelector
				variants={allVariants}
				selected={selectedVariantId}
				onselect={onVariantChange}
			/>
		</div>
	{/if}

	{#if chapter.internalChapters && chapter.internalChapters.length > 0}
		<div class="detail-section" bind:this={chaptersEl}>
			<h5 class="section-label">Chapters</h5>
			{#each chapter.internalChapters as ic}
				<a
					href="{readerHref}?page={ic.pageIndex}"
					class="internal-chapter"
				>
					<span class="internal-title">{truncTitle(ic.title)}</span>
					<span class="internal-page">p.{ic.pageIndex + 1}</span>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.chapter-detail {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px 0 70px;
	}

	.detail-title {
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0 0 4px;
		line-height: 1.3;
	}

	.detail-info {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		line-height: normal;
		margin-bottom: 6px;
	}

	.info-item {
		font-size: 0.65rem;
		color: inherit;
	}

	/* ── Dot progress tracker ── */

	.dot-tracker {
		margin-bottom: 0;
	}

	.dot-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
		cursor: pointer;
		border-radius: 4px;
		padding: 2px 0;
		transition: opacity var(--transition-fast);
	}

	.dot-label:hover { opacity: 0.8; }

	.dot-label-left {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}

	.dot-toggle {
		display: flex;
		align-items: center;
		gap: 2px;
		opacity: 0.4;
		transition: opacity var(--transition-fast);
	}

	.dot-label:hover .dot-toggle { opacity: 0.8; }

	.dot-toggle-eye { flex-shrink: 0; }

	.dot-toggle-caret {
		transition: transform 0.2s ease;
	}

	.dot-toggle-caret.flipped {
		transform: rotate(180deg);
	}

	.dot-status {
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.dot-status.read { color: var(--color-success-500); }
	.dot-status.in-progress { color: var(--color-primary-500); }
	.dot-status.unread { color: inherit; }

	.dot-pct {
		font-size: 0.58rem;
		color: inherit;
		font-variant-numeric: tabular-nums;
	}

	.dot-grid-wrap {
		display: grid;
		grid-template-rows: 0fr;
		overflow: hidden;
		transition: grid-template-rows 0.3s ease, opacity 0.3s ease;
		opacity: 0;
	}

	.dot-grid-wrap.open {
		grid-template-rows: 1fr;
		opacity: 1;
	}

	.dot-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		min-height: 0;
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		opacity: 0.1;
		transition: opacity 0.15s ease, background 0.15s ease;
	}

	.dot.read {
		background: var(--color-tertiary-400);
		opacity: 0.8;
	}

	.dot.current {
		background: var(--color-tertiary-500);
		opacity: 1;
		width: 8px;
		height: 8px;
		margin: -1px;
		box-shadow: 0 0 4px var(--color-tertiary-500);
	}

	.credits {
		margin-bottom: 6px;
	}

	.credit {
		font-size: 0.7rem;
		margin: 0;
		line-height: 1.5;
	}

	.credit-label {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: inherit;
		margin-right: 4px;
	}

	.genre-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		margin-bottom: 6px;
	}

	.genre-tag {
		font-size: 0.58rem;
		padding: 1px 6px;
		border-radius: 2px;
		background: color-mix(in oklch, var(--layer-sunken) 60%, transparent);
		color: inherit;
	}

	.summary {
		font-size: 0.68rem;
		line-height: 1.55;
		color: inherit;
		margin: 0 0 8px;
		max-height: 100px;
		overflow-y: auto;
		-webkit-mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
		mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
	}

	.read-btn {
		align-self: flex-start;
		margin: 0 0 4px;
		font-weight: 700;
		font-size: 0.8rem;
	}

	.detail-section {
		margin-top: 12px;
	}

	.section-label {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: inherit;
		margin: 0 0 4px;
	}

	.internal-chapter {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 5px 8px;
		border-radius: 4px;
		font-size: 0.7rem;
		text-decoration: none !important;
		color: inherit !important;
		transition: background var(--transition-fast);
	}

	.internal-chapter:hover {
		background: color-mix(in oklch, var(--layer-border) 25%, transparent);
	}

	.internal-page {
		font-size: 0.6rem;
		color: inherit;
	}
</style>
