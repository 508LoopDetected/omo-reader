<script lang="ts">
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
	}

	let { chapters, sourceId, workId, chapterSort, chapterView, progressMap, isRead, isInProgress, onMark }: Props = $props();

	let expandedVolumeId: string | null = $state(null);

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

		// Order: root (no section) first, then by key
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
		// Root volumes section → always grid if any chapter has volumeNumber
		if (section.name === '' && section.chapters.some((c) => c.volumeNumber != null)) return 'grid';
		// Ongoing → always list
		if (section.name.toLowerCase() === 'ongoing') return 'list';
		// Otherwise respect user toggle
		return chapterView;
	}

	function getHref(chapter: Chapter): string {
		return `/work/${sourceId}/${encodeURIComponent(workId)}/${encodeURIComponent(chapter.id)}`;
	}

	// For variant grouping: find all variants sharing the same volumeNumber
	function getVariants(chapter: Chapter): Chapter[] {
		if (chapter.volumeNumber == null) return [chapter];
		return chapters.filter((c) => c.volumeNumber === chapter.volumeNumber);
	}

	// For grid display: only show primary variant (first one per volumeNumber)
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
		if (chapter.volumeNumber != null) {
			expandedVolumeId = expandedVolumeId === chapter.id ? null : chapter.id;
		}
	}
</script>

{#each sections as section}
	{#if section.name}
		<h4 class="section-heading">{section.name}</h4>
	{/if}

	{@const viewMode = sectionViewMode(section)}
	{@const sorted = sortChapters(section.chapters)}

	{#if viewMode === 'grid'}
		{@const displayed = dedupeByVolume(sorted)}
		<div class="chapter-grid">
			{#each displayed as chapter (chapter.id)}
				{@const variants = getVariants(chapter)}
				{@const isVolume = chapter.volumeNumber != null}
				<ChapterGridCard
					{chapter}
					href={getHref(chapter)}
					{sourceId}
					{workId}
					read={isRead(chapter.id)}
					inProgress={isInProgress(chapter.id)}
					progress={progressMap.get(chapter.id)}
					variantCount={variants.length > 1 ? variants.length : undefined}
					selected={expandedVolumeId === chapter.id}
					onclick={isVolume ? () => handleGridClick(chapter) : undefined}
				/>
				{#if expandedVolumeId === chapter.id}
					<VolumeDetail
						{chapter}
						allVariants={variants}
						{sourceId}
						{workId}
						read={isRead(chapter.id)}
						inProgress={isInProgress(chapter.id)}
						progress={progressMap.get(chapter.id)}
						onclose={() => expandedVolumeId = null}
					/>
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

<style>
	.section-heading {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: rgb(var(--color-surface-500));
		margin: 20px 0 8px;
	}

	.section-heading:first-child {
		margin-top: 0;
	}

	.chapter-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 12px;
	}

	.chapter-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
</style>
