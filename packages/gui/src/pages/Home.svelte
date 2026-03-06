<script lang="ts">
	import WorkCard from '$lib/components/library/WorkCard.svelte';
	import CoverImage from '$lib/components/CoverImage.svelte';
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
	<div class="has-text-centered py-6">
		<div class="loader-inline"></div>
	</div>
{:else}
	{#if continueItems.length > 0}
		<section class="mb-6">
			<h2 class="title is-4">Continue Reading</h2>
			<div class="continue-grid">
				{#each continueItems as item}
					{@const key = `${item.sourceId}:${item.workId}`}
					{@const isLocal = item.sourceId.startsWith('local:') || item.sourceId.startsWith('smb:')}
					{@const displayCover = isLocal
						? `/api/sources/${item.sourceId}/chapter-cover?chapterId=${encodeURIComponent(item.chapterId)}&offset=0&workId=${encodeURIComponent(item.workId)}`
						: item.coverUrl}
					<div class="continue-card-wrapper">
						<a
							href="/work/{item.sourceId}/{encodeURIComponent(item.workId)}/{encodeURIComponent(item.chapterId)}"
							class="continue-card"
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
							<div class="continue-title">{item.title ?? item.workId}</div>
							<div class="continue-page">Page {item.page + 1}/{item.totalPages}</div>
						</a>
						<button class="continue-menu-btn" onclick={(e) => toggleMenu(key, e)}>
							<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
						</button>
						{#if menuOpen === key}
							<div class="continue-menu">
								<button onclick={(e) => dismissItem(item, e)}>Dismiss</button>
								<button class="danger" onclick={(e) => resetItem(item, e)}>Reset progress</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if recentLibrary.length > 0}
		<section class="mb-6">
			<div class="section-header">
				<h2 class="title is-4 mb-0">Library</h2>
				<a href="/library" class="view-all">View all</a>
			</div>
			<div class="work-grid">
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
			</div>
		</section>
	{:else}
		<div class="empty-state">
			<p class="has-text-grey">Your library is empty. Browse <a href="/sources">sources</a> or add local paths in <a href="/settings">Settings</a> to get started.</p>
		</div>
	{/if}
{/if}

<style>
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}

	.view-all {
		font-size: 0.85rem;
		color: var(--accent);
	}

	.continue-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 12px;
	}

	.continue-card-wrapper {
		position: relative;
	}

	.continue-card {
		display: block;
		text-decoration: none;
		color: inherit;
		transition: transform 0.15s;
	}


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
		background: var(--accent);
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

	.continue-menu {
		position: absolute;
		top: 30px;
		right: 4px;
		background: #1e1e2e;
		border: 1px solid #333;
		border-radius: 6px;
		overflow: hidden;
		z-index: 10;
		min-width: 140px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
	}

	.continue-menu button {
		display: block;
		width: 100%;
		padding: 8px 12px;
		border: none;
		background: none;
		color: #ddd;
		font-size: 0.8rem;
		text-align: left;
		cursor: pointer;
	}

	.continue-menu button:hover {
		background: #2a2a3e;
	}

	.continue-menu button.danger {
		color: #e74c3c;
	}

	.continue-menu button.danger:hover {
		background: rgba(231, 76, 60, 0.15);
	}

	.continue-title {
		font-size: 0.8rem;
		color: #ddd;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.continue-page {
		font-size: 0.7rem;
		color: var(--text-secondary);
	}

	.work-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 16px;
	}

	.empty-state {
		padding: 48px 24px;
		text-align: center;
		background: var(--bg-secondary);
		border-radius: 8px;
	}

	.loader-inline {
		width: 32px;
		height: 32px;
		border: 3px solid #333;
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto;
	}

	@keyframes spin { to { transform: rotate(360deg); } }
</style>
