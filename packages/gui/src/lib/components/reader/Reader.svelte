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

	// Hover buttons (close/fullscreen) — show on mouse move, fade after idle
	let hoverButtonsVisible = $state(false);
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;

	let cursorHidden = $state(false);

	// Edge glow / caret proximity
	let edgeLeftOpacity = $state(0);
	let edgeRightOpacity = $state(0);
	let edgeTopOpacity = $state(0);
	const EDGE_ZONE = 0.33; // outer third of the screen

	function onMouseMove(e: MouseEvent) {
		cursorHidden = false;
		hoverButtonsVisible = true;
		if (hoverTimer) clearTimeout(hoverTimer);
		hoverTimer = setTimeout(() => { hoverButtonsVisible = false; }, 2000);

		// Edge proximity for glow/caret
		if (mode === 'vertical') {
			edgeLeftOpacity = 0;
			edgeRightOpacity = 0;
			edgeTopOpacity = 0;
			return;
		}
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = (e.clientX - rect.left) / rect.width; // 0..1
		if (x < EDGE_ZONE) {
			edgeLeftOpacity = Math.pow(1 - x / EDGE_ZONE, 1.5);
			edgeRightOpacity = 0;
			edgeTopOpacity = 0;
		} else if (x > 1 - EDGE_ZONE) {
			edgeRightOpacity = Math.pow((x - (1 - EDGE_ZONE)) / EDGE_ZONE, 1.5);
			edgeLeftOpacity = 0;
			edgeTopOpacity = 0;
		} else {
			// Center third — top glow, intensity by how centered + how high
			const centeredness = 1 - Math.abs(x - 0.5) / (EDGE_ZONE * 0.5);
			const y = (e.clientY - rect.top) / rect.height;
			const verticalProximity = Math.pow(1 - Math.min(y / 0.5, 1), 1.5);
			edgeTopOpacity = centeredness * verticalProximity;
			edgeLeftOpacity = 0;
			edgeRightOpacity = 0;
		}
	}

	function onMouseLeave() {
		edgeLeftOpacity = 0;
		edgeRightOpacity = 0;
		edgeTopOpacity = 0;
	}

	function hideCursor() {
		cursorHidden = true;
		hoverButtonsVisible = false;
		edgeLeftOpacity = 0;
		edgeRightOpacity = 0;
		edgeTopOpacity = 0;
		if (hoverTimer) clearTimeout(hoverTimer);
	}

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
			return;
		}
		if (e.key === 'f') {
			toggleFullscreen();
			return;
		}
		// Hide cursor on navigation keys
		if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
			hideCursor();
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="reader" class:cursor-hidden={cursorHidden} onmousemove={onMouseMove} onmouseleave={onMouseLeave}>
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

	<!-- Edge glow + carets -->
	{#if mode !== 'vertical'}
		<div class="edge-glow edge-glow--left" style="opacity: {edgeLeftOpacity * 0.6}"></div>
		<div class="edge-glow edge-glow--right" style="opacity: {edgeRightOpacity * 0.6}"></div>
		<div class="edge-glow edge-glow--top" style="opacity: {edgeTopOpacity * 0.6}"></div>
		<div class="edge-caret edge-caret--left" style="opacity: {edgeLeftOpacity}">
			<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
				{#if direction === 'rtl'}
					<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
				{:else}
					<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
				{/if}
			</svg>
		</div>
		<div class="edge-caret edge-caret--right" style="opacity: {edgeRightOpacity}">
			<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
				{#if direction === 'rtl'}
					<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
				{:else}
					<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
				{/if}
			</svg>
		</div>
		<div class="edge-caret edge-caret--top" style="opacity: {edgeTopOpacity}">
			<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
				<path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
			</svg>
		</div>
	{/if}

	<div class="hover-buttons" class:visible={hoverButtonsVisible || controlsVisible}>
		<button class="hover-btn" onclick={toggleFullscreen} title="Fullscreen (F)">
			{#if document.fullscreenElement}
				<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
			{:else}
				<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
			{/if}
		</button>
		<button class="hover-btn" onclick={onClose} title="Close (Esc)">
			<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
		</button>
	</div>

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
		z-index: 9999;
		background: #000;
	}

	.reader.cursor-hidden,
	.reader.cursor-hidden :global(*) {
		cursor: none !important;
	}

	.hover-buttons {
		position: absolute;
		top: 12px;
		right: 12px;
		display: flex;
		gap: 6px;
		z-index: 200;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}

	.hover-buttons.visible {
		opacity: 1;
		pointer-events: auto;
	}

	.hover-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 5px;
		background: rgba(0, 0, 0, 0.6);
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		backdrop-filter: blur(8px);
		transition: background 0.15s, color 0.15s;
	}

	.hover-btn:hover {
		background: rgba(0, 0, 0, 0.8);
		color: #fff;
	}

	/* ── Edge glow ── */

	.edge-glow {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 120px;
		pointer-events: none;
		z-index: 50;
		transition: opacity 0.15s ease-out;
	}

	.edge-glow--left {
		left: 0;
		background: linear-gradient(to right, rgba(255, 255, 255, 0.12), transparent);
	}

	.edge-glow--right {
		right: 0;
		background: linear-gradient(to left, rgba(255, 255, 255, 0.12), transparent);
	}

	.edge-glow--top {
		top: 0;
		left: 33.3%;
		right: 33.3%;
		width: auto;
		height: 100px;
		background: linear-gradient(to bottom, rgba(255, 255, 255, 0.12), transparent);
	}

	/* ── Edge carets ── */

	.edge-caret {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
		z-index: 51;
		color: rgba(255, 255, 255, 0.85);
		filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.6));
		transition: opacity 0.15s ease-out;
	}

	.edge-caret--left {
		left: 16px;
	}

	.edge-caret--right {
		right: 16px;
	}

	.edge-caret--top {
		top: 16px;
		left: 50%;
		transform: translateX(-50%);
	}
</style>
