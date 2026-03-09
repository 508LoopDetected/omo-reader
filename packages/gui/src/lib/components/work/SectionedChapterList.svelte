<script lang="ts">
	import ChapterListRow from './ChapterListRow.svelte';
	import ChapterGridCard from './ChapterGridCard.svelte';
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
		showGridText?: boolean;
		selectedVolumeId: string | null;
		onSelect: (chapterId: string | null) => void;
		onVariantChange: (volumeId: string, variantId: string) => void;
	}

	let {
		chapters, sourceId, workId, chapterSort, chapterView, progressMap,
		isRead, isInProgress, onMark, rootSectionLabel, showGridText = true,
		selectedVolumeId, onSelect, onVariantChange,
	}: Props = $props();

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

	function handleGridClick(chapter: Chapter) {
		onSelect(selectedVolumeId === chapter.id ? null : chapter.id);
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
							{variants}
							selected={selectedVolumeId === chapter.id}
							{showGridText}
							onclick={() => handleGridClick(chapter)}
							onVariantChange={(v) => onVariantChange(chapter.id, v.id)}
						/>
					</div>
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
		color: var(--color-surface-300);
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

	.grid-card-wrapper {
		position: relative;
	}
</style>
