<script lang="ts">
	import SpreadView from './SpreadView.svelte';
	import SinglePageView from './SinglePageView.svelte';
	import VerticalScroll from './VerticalScroll.svelte';
	import ReaderControls from './ReaderControls.svelte';
	import type { Page, ReaderMode, ReadingDirection, Chapter } from '@omo/core';

	interface Props {
		pages: Page[];
		workTitle: string;
		chapterTitle: string;
		sourceId: string;
		workId: string;
		chapterId: string;
		chapters?: Chapter[];
		initialPage?: number;
		internalChapters?: { title: string; pageIndex: number }[];
		onClose: () => void;
		onChapterChange?: (chapterId: string) => void;
	}

	let {
		pages, workTitle, chapterTitle, sourceId, workId, chapterId,
		chapters = [], initialPage = 0, internalChapters, onClose, onChapterChange,
	}: Props = $props();

	let currentPage = $state(initialPage);
	let mode: ReaderMode = $state('spread');
	let direction: ReadingDirection = $state('rtl');
	let offset = $state(true);
	let controlsVisible = $state(false);
	let markedComplete = $state(false);
	let settingsLoaded = $state(false);

	// Load reader settings via cascading resolution (title → library → type → global → fallback)
	async function loadReaderDefaults() {
		if (settingsLoaded) return;
		try {
			const res = await fetch(`/api/reader-settings?sourceId=${encodeURIComponent(sourceId)}&workId=${encodeURIComponent(workId)}`);
			if (res.ok) {
				const settings: { direction: ReadingDirection; offset: boolean; mode: ReaderMode } = await res.json();
				mode = settings.mode;
				direction = settings.direction;
				offset = settings.offset;
			}
		} catch { /* use defaults */ }
		settingsLoaded = true;
	}

	loadReaderDefaults();

	let saveTimeout: ReturnType<typeof setTimeout> | null = null;

	// Chapter navigation
	let currentChapterIndex = $derived(chapters.findIndex((c) => c.id === chapterId));
	let hasPrevChapter = $derived(currentChapterIndex < chapters.length - 1);
	let hasNextChapter = $derived(currentChapterIndex > 0);

	function handlePageChange(page: number) {
		currentPage = page;
		debouncedSaveProgress();

		// Mark as complete when reaching last pages (READ_THRESHOLD = 2 from core/reading.ts)
		if (!markedComplete && page >= pages.length - 2) {
			markedComplete = true;
			saveProgress(); // immediate save at the end
		}
	}

	function toggleControls() {
		controlsVisible = !controlsVisible;
	}

	function debouncedSaveProgress() {
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => saveProgress(), 1000);
	}

	async function saveProgress() {
		try {
			await fetch('/api/progress', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sourceId,
					workId,
					chapterId,
					page: currentPage,
					totalPages: pages.length,
				}),
			});
		} catch (err) {
			console.error('Failed to save progress:', err);
		}
	}

	function goPrevChapter() {
		if (hasPrevChapter) {
			const prevChapter = chapters[currentChapterIndex + 1];
			onChapterChange?.(prevChapter.id);
		}
	}

	function goNextChapter() {
		if (hasNextChapter) {
			const nextChapter = chapters[currentChapterIndex - 1];
			onChapterChange?.(nextChapter.id);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (controlsVisible) {
				controlsVisible = false;
			} else {
				onClose();
			}
			e.preventDefault();
		} else if (e.key === 'f') {
			toggleFullscreen();
		}
	}

	function toggleFullscreen() {
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			document.documentElement.requestFullscreen();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="reader">
	{#if mode === 'spread'}
		<SpreadView
			{pages}
			currentPage={currentPage}
			{direction}
			{offset}
			onPageChange={handlePageChange}
			onToggleControls={toggleControls}
		/>
	{:else if mode === 'single'}
		<SinglePageView
			{pages}
			currentPage={currentPage}
			{direction}
			onPageChange={handlePageChange}
			onToggleControls={toggleControls}
		/>
	{:else}
		<VerticalScroll
			{pages}
			currentPage={currentPage}
			onPageChange={handlePageChange}
			onToggleControls={toggleControls}
		/>
	{/if}

	<ReaderControls
		visible={controlsVisible}
		{currentPage}
		totalPages={pages.length}
		{mode}
		{direction}
		spreadOffset={offset}
		{workTitle}
		{chapterTitle}
		{hasPrevChapter}
		{hasNextChapter}
		{internalChapters}
		onPageChange={handlePageChange}
		onModeChange={(m) => mode = m}
		onDirectionChange={(d) => direction = d}
		onOffsetChange={(o) => offset = o}
		onPrevChapter={goPrevChapter}
		onNextChapter={goNextChapter}
		onClose={onClose}
	/>
</div>

<style>
	.reader {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: #000;
	}
</style>
