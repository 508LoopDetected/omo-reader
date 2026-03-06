<script lang="ts">
	import Reader from './components/Reader.svelte';

	interface Page {
		url: string;
	}

	interface Chapter {
		id: string;
		title: string;
		[key: string]: unknown;
	}

	// Parse URL parameters
	function getParams(): { sourceId: string; workId: string; chapterId: string } {
		const params = new URLSearchParams(window.location.search);
		return {
			sourceId: params.get('sourceId') ?? '',
			workId: params.get('workId') ?? '',
			chapterId: params.get('chapterId') ?? '',
		};
	}

	let { sourceId, workId, chapterId } = $state(getParams());

	let pages: Page[] = $state([]);
	let chapters: Chapter[] = $state([]);
	let loading = $state(true);
	let initialPage = $state(0);
	let workTitle = $state('');
	let chapterTitle = $state('');

	async function loadPages() {
		loading = true;
		try {
			const [pagesRes, detailRes, progressRes] = await Promise.all([
				fetch(`/api/sources/${encodeURIComponent(sourceId)}/pages?id=${encodeURIComponent(chapterId)}`),
				fetch(`/api/sources/${encodeURIComponent(sourceId)}/work?id=${encodeURIComponent(workId)}`),
				fetch(`/api/progress?sourceId=${encodeURIComponent(sourceId)}&workId=${encodeURIComponent(workId)}&chapterId=${encodeURIComponent(chapterId)}`),
			]);

			if (pagesRes.ok) pages = await pagesRes.json();

			if (detailRes.ok) {
				const data = await detailRes.json();
				workTitle = data.work.title;
				chapters = data.chapters;
				const chapter = data.chapters.find((c: Chapter) => c.id === chapterId);
				chapterTitle = chapter?.title ?? '';
			}

			if (progressRes.ok) {
				const progress = await progressRes.json();
				if (progress?.page) initialPage = progress.page;
			}
		} catch (err) {
			console.error('Failed to load chapter:', err);
		} finally {
			loading = false;
		}
	}

	function handleClose() {
		window.close();
	}

	function handleChapterChange(newChapterId: string) {
		// Update URL params and reload data
		const url = new URL(window.location.href);
		url.searchParams.set('chapterId', newChapterId);
		window.history.replaceState(null, '', url.toString());

		// Reset state and reload
		chapterId = newChapterId;
		pages = [];
		initialPage = 0;
		loadPages();
	}

	// Initial load
	loadPages();
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
		onClose={handleClose}
		onChapterChange={handleChapterChange}
	/>
{:else}
	<div class="loading-screen">
		<p>No pages found.</p>
	</div>
{/if}

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #000;
		overflow: hidden;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.loading-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		color: #888;
		gap: 16px;
	}

	.loader {
		width: 40px;
		height: 40px;
		border: 3px solid #333;
		border-top-color: #7c5cbf;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }
</style>
