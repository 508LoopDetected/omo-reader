<script lang="ts">
	import { slide } from 'svelte/transition';
	import ChapterListRow from './ChapterListRow.svelte';
	import ChapterGridCard from './ChapterGridCard.svelte';
	import VolumeDetail from './VolumeDetail.svelte';
	import type { Chapter } from '@omo/core';

	interface Props {
		chapters: Chapter[];
		sourceId: string;
		workId: string;
		chapterSort: 'asc' | 'desc';
		chapterView: 'list' | 'grid';
		progressMap: Map<string, { page: number; totalPages: number }>;
		isRead: (id: string) => boolean;
		isInProgress: (id: string) => boolean;
		onMark: (chapter: Chapter, read: boolean, evt: MouseEvent) => void;
		rootSectionLabel?: string;
	}

	let { chapters, sourceId, workId, chapterSort, chapterView, progressMap, isRead, isInProgress, onMark, rootSectionLabel }: Props = $props();

	let selectedVolumeId: string | null = $state(null);
	let selectedChapter = $derived(chapters.find((c) => c.id === selectedVolumeId) ?? null);

	// Track the selected card element for positioning the tab
	let panelEl = $state<HTMLElement>();
	let tabOffset = $state(0);

	// Calculate the tab position after the panel mounts
	$effect(() => {
		if (!selectedVolumeId || !panelEl) return;
		const wrapper = panelEl.parentElement?.querySelector('.grid-card-wrapper.selected') as HTMLElement | null;
		if (!wrapper) return;

		const wrapperRect = wrapper.getBoundingClientRect();
		const panelRect = panelEl.getBoundingClientRect();
		tabOffset = (wrapperRect.left + wrapperRect.width / 2) - panelRect.left;
	});

	// Group chapters by section
	interface SectionGroup {
		name: string;
		chapters: Chapter[];
	}

	let sections = $derived.by(() => {
		const hasSections = chapters.some((c) => c.section);
		if (!hasSections) return [{ name: '', chapters }];

		const groups = new Map<string, Chapter[]>();
		for (const ch of chapters) {
			const key = ch.section ?? '';
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(ch);
		}

		const result: SectionGroup[] = [];
		const root = groups.get('');
		if (root) result.push({ name: '', chapters: root });
		for (const [name, chs] of groups) {
			if (name !== '') result.push({ name, chapters: chs });
		}
		return result;
	});

	function sortChapters(chs: Chapter[]): Chapter[] {
		return [...chs].sort((a, b) => {
			const numA = a.chapterNumber ?? 0;
			const numB = b.chapterNumber ?? 0;
			return chapterSort === 'desc' ? numB - numA : numA - numB;
		});
	}

	function sectionViewMode(section: SectionGroup): 'list' | 'grid' {
		if (section.name === '' && section.chapters.some((c) => c.volumeNumber != null)) return 'grid';
		if (section.name.toLowerCase() === 'ongoing') return 'list';
		return chapterView;
	}

	function getHref(chapter: Chapter): string {
		return `/work/${sourceId}/${encodeURIComponent(workId)}/${encodeURIComponent(chapter.id)}`;
	}

	function getVariants(chapter: Chapter): Chapter[] {
		if (chapter.volumeNumber == null) return [chapter];
		return chapters.filter((c) => c.volumeNumber === chapter.volumeNumber);
	}

	function dedupeByVolume(chs: Chapter[]): Chapter[] {
		const seen = new Set<number>();
		return chs.filter((c) => {
			if (c.volumeNumber == null) return true;
			if (seen.has(c.volumeNumber)) return false;
			seen.add(c.volumeNumber);
			return true;
		});
	}

	// Flat ordered list of displayed chapter IDs for prev/next navigation
	let displayedIds = $derived.by(() => {
		const ids: string[] = [];
		for (const section of sections) {
			const view = sectionViewMode(section);
			const sorted = sortChapters(section.chapters);
			if (view === 'grid') {
				for (const ch of dedupeByVolume(sorted)) ids.push(ch.id);
			} else {
				for (const ch of sorted) ids.push(ch.id);
			}
		}
		return ids;
	});

	let selectedIndex = $derived(selectedVolumeId ? displayedIds.indexOf(selectedVolumeId) : -1);
	let hasPrev = $derived(selectedIndex > 0);
	let hasNext = $derived(selectedIndex >= 0 && selectedIndex < displayedIds.length - 1);

	function handleGridClick(chapter: Chapter) {
		selectedVolumeId = selectedVolumeId === chapter.id ? null : chapter.id;
	}

	function goPrev() {
		if (hasPrev) selectedVolumeId = displayedIds[selectedIndex - 1];
	}

	function goNext() {
		if (hasNext) selectedVolumeId = displayedIds[selectedIndex + 1];
	}

</script>

<div class="chapter-layout">
	{#each sections as section}
		{@const heading = section.name || (rootSectionLabel && sections.length > 1 ? rootSectionLabel : '')}
		{#if heading && sections.length > 1}
			<h4 class="section-heading">{heading}</h4>
		{/if}

		{@const viewMode = sectionViewMode(section)}
		{@const sorted = sortChapters(section.chapters)}

		{#if viewMode === 'grid'}
			{@const displayed = dedupeByVolume(sorted)}
			<div class="chapter-grid">
				{#each displayed as chapter (chapter.id)}
					{@const variants = getVariants(chapter)}
					<div class="grid-card-wrapper" class:selected={selectedVolumeId === chapter.id}>
						<ChapterGridCard
							{chapter}
							href={getHref(chapter)}
							{sourceId}
							{workId}
							read={isRead(chapter.id)}
							inProgress={isInProgress(chapter.id)}
							progress={progressMap.get(chapter.id)}
							variantCount={variants.length > 1 ? variants.length : undefined}
							selected={selectedVolumeId === chapter.id}
							onclick={() => handleGridClick(chapter)}
						/>
					</div>
					{#if selectedVolumeId === chapter.id && selectedChapter}
						<div class="accordion-panel" bind:this={panelEl} style="--tab-offset: {tabOffset}px" transition:slide={{ duration: 250 }}>
							<div class="accordion-tab"></div>
							<div class="accordion-content">
								<nav class="accordion-nav">
									<button class="accordion-close" onclick={() => selectedVolumeId = null} aria-label="Close">
										<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
									</button>
									<div class="accordion-arrows">
										<button class="accordion-arrow" onclick={goPrev} disabled={!hasPrev} aria-label="Previous">
											<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
										</button>
										<button class="accordion-arrow" onclick={goNext} disabled={!hasNext} aria-label="Next">
											<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
										</button>
									</div>
								</nav>
								<VolumeDetail
									chapter={selectedChapter}
									allVariants={getVariants(selectedChapter)}
									{sourceId}
									{workId}
									read={isRead(selectedChapter.id)}
									inProgress={isInProgress(selectedChapter.id)}
									progress={progressMap.get(selectedChapter.id)}
									onclose={() => selectedVolumeId = null}
								/>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{:else}
			<div class="chapter-list">
				{#each sorted as chapter (chapter.id)}
					<ChapterListRow
						{chapter}
						href={getHref(chapter)}
						read={isRead(chapter.id)}
						inProgress={isInProgress(chapter.id)}
						progress={progressMap.get(chapter.id)}
						onMark={(read, evt) => onMark(chapter, read, evt)}
					/>
				{/each}
			</div>
		{/if}
	{/each}
</div>

<style>
	.chapter-layout {
		display: flex;
		flex-direction: column;
	}

	.section-heading {
		font-size: 1.1rem;
		font-weight: 600;
		color: rgb(var(--color-surface-300));
		margin: 24px 0 12px;
	}

	.section-heading:first-child {
		margin-top: 0;
	}

	.chapter-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(max(130px, calc((100% - 5 * 12px) / 6)), 1fr));
		gap: 12px;
		align-items: start;
	}

	.chapter-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* Selected card wrapper — visual connection to accordion */
	.grid-card-wrapper {
		position: relative;
		border-radius: 10px;
		transition: all 0.2s ease;
	}

	.grid-card-wrapper.selected {
		background: color-mix(in oklch, var(--layer-raised) 80%, transparent);
		padding: 6px;
		margin: -6px;
		border-radius: 10px 10px 0 0;
		z-index: 2;
	}

	/* Accordion panel — spans full grid row */
	.accordion-panel {
		grid-column: 1 / -1;
		position: relative;
		margin-top: -2px;
		overflow: hidden;
	}

	/* Tab that points up to the selected card */
	.accordion-tab {
		position: absolute;
		top: -8px;
		left: calc(var(--tab-offset, 80px) - 10px);
		width: 20px;
		height: 10px;
		clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
		background: color-mix(in oklch, var(--layer-raised) 80%, transparent);
		z-index: 3;
		transition: left 0.2s ease;
	}

	.accordion-content {
		background: color-mix(in oklch, var(--layer-raised) 80%, transparent);
		border: 1px solid color-mix(in oklch, var(--layer-border) 40%, transparent);
		border-radius: 12px;
		padding: 16px;
	}

	.accordion-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.accordion-close,
	.accordion-arrow {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 6px;
		background: color-mix(in oklch, var(--layer-border) 30%, transparent);
		color: rgb(var(--color-surface-400));
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.accordion-close:hover,
	.accordion-arrow:hover:not(:disabled) {
		background: color-mix(in oklch, var(--layer-border) 60%, transparent);
	}

	.accordion-arrow:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.accordion-arrows {
		display: flex;
		gap: 4px;
	}
</style>
