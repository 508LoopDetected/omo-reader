<script lang="ts">
	import { goto } from '$lib/router.js';
	import Reader from '$lib/components/reader/Reader.svelte';
	import type { Page as WorkPage, Chapter } from '@omo/core';

	let { params, searchParams }: { params: Record<string, string>; searchParams: URLSearchParams } = $props();
	let sourceId = $derived(params.sourceId ?? '');
	let workId = $derived(params.workId ?? '');
	let chapterId = $derived(params.chapterId ?? '');

	let pages: WorkPage[] = $state([]);
	let chapters: Chapter[] = $state([]);
	let loading = $state(true);
	let initialPage = $state(0);
	let workTitle = $state('');
	let chapterTitle = $state('');
	let internalChapters = $state<{ title: string; pageIndex: number }[]>([]);

	async function loadPages() {
		loading = true;
		try {
			const [pagesRes, detailRes, progressRes] = await Promise.all([
				fetch(`/api/sources/${sourceId}/pages?id=${encodeURIComponent(chapterId)}`),
				fetch(`/api/sources/${sourceId}/work?id=${encodeURIComponent(workId)}`),
				fetch(`/api/progress?sourceId=${sourceId}&workId=${encodeURIComponent(workId)}&chapterId=${encodeURIComponent(chapterId)}`),
			]);

			if (pagesRes.ok) pages = await pagesRes.json();

			if (detailRes.ok) {
				const data = await detailRes.json();
				workTitle = data.work.title;
				chapters = data.chapters;
				const chapter = data.chapters.find((c: Chapter) => c.id === chapterId);
				chapterTitle = chapter?.title ?? '';
				internalChapters = chapter?.internalChapters ?? [];
			}

			// Page offset from query param takes priority over saved progress
			const pageParam = searchParams.get('page');
			if (pageParam != null) {
				initialPage = parseInt(pageParam, 10) || 0;
			} else if (progressRes.ok) {
				const progress = await progressRes.json();
				if (progress?.page) initialPage = progress.page;
			}
		} catch (err) {
			console.error('Failed to load chapter:', err);
		} finally {
			loading = false;
		}
	}

	let isReaderMode = $derived(searchParams.get('mode') === 'reader');

	function handleClose() {
		if (isReaderMode) {
			window.close();
			return;
		}
		goto(`/work/${sourceId}/${encodeURIComponent(workId)}`, { replace: true, force: true });
	}

	function handleChapterChange(newChapterId: string) {
		const modeParam = isReaderMode ? '?mode=reader' : '';
		goto(`/work/${sourceId}/${encodeURIComponent(workId)}/${encodeURIComponent(newChapterId)}${modeParam}`);
	}

	$effect(() => {
		// Reset and reload when chapter changes
		void chapterId;
		pages = [];
		initialPage = 0;
		loadPages();
	});
</script>

{#if loading}
	<div class="loading-screen">
		<div class="loader"></div>
		<p>Loading chapter...</p>
	</div>
{:else if pages.length > 0}
	<Reader
		{pages}
		{workTitle}
		{chapterTitle}
		{sourceId}
		{workId}
		{chapterId}
		{chapters}
		{initialPage}
		{internalChapters}
		onClose={handleClose}
		onChapterChange={handleChapterChange}
	/>
{:else}
	<div class="loading-screen">
		<p>No pages found.</p>
		<a href="/work/{sourceId}/{encodeURIComponent(workId)}">Back to title</a>
	</div>
{/if}

<style>
	.loading-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 80vh;
		color: var(--color-surface-500);
		gap: 16px;
	}

	.loader {
		width: 40px;
		height: 40px;
		border: 3px solid var(--color-surface-700);
		border-top-color: var(--color-primary-500);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }
</style>
