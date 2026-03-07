<script lang="ts">
	import WorkCard from '$lib/components/library/WorkCard.svelte';
	import CoverImage from '$lib/components/CoverImage.svelte';
	import WorkGrid from '$lib/components/WorkGrid.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { nsfwMode } from '$lib/stores/nsfw.js';

	interface ContinueItem {
		sourceId: string;
		workId: string;
		chapterId: string;
		page: number;
		totalPages: number;
		updatedAt: string;
		title?: string;
		coverUrl?: string;
		nsfw?: boolean;
	}

	interface LibraryItem {
		sourceId: string;
		workId: string;
		title: string;
		coverUrl: string | null;
		nsfw: boolean;
		unreadCount: number;
	}

	let continueItems: ContinueItem[] = $state([]);
	let recentLibrary: LibraryItem[] = $state([]);
	let loading = $state(true);

	async function loadHome() {
		loading = true;
		try {
			const res = await fetch(`/api/home?nsfwMode=${$nsfwMode}`);
			if (res.ok) {
				const data: { continueReading: ContinueItem[]; recentLibrary: LibraryItem[] } = await res.json();
				continueItems = data.continueReading;
				recentLibrary = data.recentLibrary;
			}
		} catch (err) {
			console.error('Failed to load home:', err);
		} finally {
			loading = false;
		}
	}

	async function dismissItem(item: ContinueItem, evt: MouseEvent) {
		evt.preventDefault();
		evt.stopPropagation();
		await fetch('/api/progress', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sourceId: item.sourceId, workId: item.workId }),
		});
		continueItems = continueItems.filter(
			(i) => !(i.sourceId === item.sourceId && i.workId === item.workId),
		);
	}

	async function resetItem(item: ContinueItem, evt: MouseEvent) {
		evt.preventDefault();
		evt.stopPropagation();
		await fetch(`/api/progress?sourceId=${encodeURIComponent(item.sourceId)}&workId=${encodeURIComponent(item.workId)}`, {
			method: 'DELETE',
		});
		continueItems = continueItems.filter(
			(i) => !(i.sourceId === item.sourceId && i.workId === item.workId),
		);
	}

	let menuOpen: string | null = $state(null);

	function toggleMenu(key: string, evt: MouseEvent) {
		evt.preventDefault();
		evt.stopPropagation();
		menuOpen = menuOpen === key ? null : key;
	}

	$effect(() => {
		void $nsfwMode;
		loadHome();
	});

	$effect(() => {
		if (menuOpen === null) return;
		function closeMenu() { menuOpen = null; }
		window.addEventListener('click', closeMenu);
		return () => window.removeEventListener('click', closeMenu);
	});
</script>

{#if loading}
	<LoadingSpinner />
{:else}
	{#if continueItems.length > 0}
		<section class="mb-8">
			<h2 class="h4">Continue Reading</h2>
			<div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
				{#each continueItems as item}
					{@const key = `${item.sourceId}:${item.workId}`}
					{@const isLocal = item.sourceId.startsWith('local:') || item.sourceId.startsWith('smb:')}
					{@const displayCover = isLocal
						? `/api/sources/${item.sourceId}/chapter-cover?chapterId=${encodeURIComponent(item.chapterId)}&offset=0&workId=${encodeURIComponent(item.workId)}`
						: item.coverUrl}
					<div class="continue-card-wrapper relative">
						<a
							href="/work/{item.sourceId}/{encodeURIComponent(item.workId)}/{encodeURIComponent(item.chapterId)}"
							class="block no-underline transition-transform"
							data-tilt-hover
						>
							<CoverImage url={displayCover} sourceId={item.sourceId} workId={item.workId} alt={item.title ?? 'Manga'} fallbackChar={(item.title ?? '?').charAt(0)}>
								{#snippet overlay()}
									<div class="continue-progress">
										<div
											class="continue-bar"
											style="width: {item.totalPages > 0 ? ((item.page + 1) / item.totalPages) * 100 : 0}%"
										></div>
									</div>
								{/snippet}
							</CoverImage>
							<div class="text-xs text-surface-200 line-clamp-1 mt-1">{item.title ?? item.workId}</div>
							<div class="text-xs text-surface-500">Page {item.page + 1}/{item.totalPages}</div>
						</a>
						<button class="continue-menu-btn" onclick={(e) => toggleMenu(key, e)}>
							<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
						</button>
						{#if menuOpen === key}
							<div class="absolute top-[30px] right-1 bg-surface-800 border border-surface-700 rounded-md z-10 min-w-[140px] shadow-lg overflow-hidden">
								<button class="block w-full px-3 py-2 text-left text-xs hover:bg-surface-700 transition-colors" onclick={(e) => dismissItem(item, e)}>Dismiss</button>
								<button class="block w-full px-3 py-2 text-left text-xs text-error-500 hover:bg-error-500/10 transition-colors" onclick={(e) => resetItem(item, e)}>Reset progress</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if recentLibrary.length > 0}
		<section class="mb-8">
			<div class="flex items-center justify-between mb-4">
				<h2 class="h4 mb-0!">Library</h2>
				<a href="/library" class="text-sm anchor">View all</a>
			</div>
			<WorkGrid>
				{#each recentLibrary as item}
					<WorkCard
						title={item.title}
						coverUrl={item.coverUrl ?? undefined}
						sourceId={item.sourceId}
						workId={item.workId}
						href="/work/{item.sourceId}/{encodeURIComponent(item.workId)}"
						nsfw={item.nsfw}
					/>
				{/each}
			</WorkGrid>
		</section>
	{:else}
		<EmptyState>
			<p class="text-surface-500">Your library is empty. Browse <a href="/sources">sources</a> or add local paths in <a href="/settings">Settings</a> to get started.</p>
		</EmptyState>
	{/if}
{/if}

<style>
	.continue-progress {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: rgba(0, 0, 0, 0.6);
	}

	.continue-bar {
		height: 100%;
		background: rgb(var(--color-primary-500));
		transition: width 0.3s;
	}

	.continue-menu-btn {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 24px;
		height: 24px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.6);
		color: #ccc;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s;
		z-index: 2;
	}

	.continue-card-wrapper:hover .continue-menu-btn {
		opacity: 1;
	}
</style>
