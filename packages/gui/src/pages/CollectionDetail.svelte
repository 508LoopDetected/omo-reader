<script lang="ts">
	import WorkCard from '$lib/components/library/WorkCard.svelte';
	import GearToggle from '$lib/components/GearToggle.svelte';
	import EntitySettings from '$lib/components/EntitySettings.svelte';
	import { goto } from '$lib/router.js';
	import type { Collection, UserLibrary, ViewDef } from '@omo/core';
	import { nsfwMode } from '$lib/stores/nsfw.js';

	let managing = $state(false);

	let { params }: { params: Record<string, string> } = $props();

	interface EnrichedItem {
		id: number;
		sourceId: string;
		workId: string;
		title: string;
		coverUrl: string | null;
		author: string | null;
		status: string | null;
		nsfw: boolean;
		libraryId: string | null;
		unreadCount: number;
	}

	interface SourceInfo {
		id: string;
		type: string;
		connected?: boolean;
	}

	let collectionId = $derived(params.collectionId ?? '');
	let collection = $state<Collection | null>(null);
	let items: EnrichedItem[] = $state([]);
	let totalCount = $state(0);
	let userLibraries: UserLibrary[] = $state([]);
	let disconnectedSources = $state(new Set<string>());
	let loading = $state(true);
	let searchQuery = $state('');
	let sortBy = $state<string>('title');
	let viewDef = $state<ViewDef | null>(null);

	let sortControl = $derived(viewDef?.controls.find(c => c.key === 'sort'));
	let sortOptions = $derived(sortControl?.options ?? [
		{ value: 'title', label: 'A-Z' },
		{ value: 'recent', label: 'Recent' },
		{ value: 'added', label: 'Added' },
	]);

	async function loadCollection() {
		loading = true;
		items = [];
		try {
			const params = new URLSearchParams({
				collectionId,
				enriched: 'true',
				sort: sortBy,
				nsfwMode: $nsfwMode,
			});
			if (searchQuery.trim()) params.set('search', searchQuery.trim());

			const [colsRes, itemsRes, sourcesRes, libsRes, manifestRes] = await Promise.all([
				fetch('/api/collections'),
				fetch(`/api/collections/items?${params}`),
				fetch('/api/sources'),
				fetch('/api/user-libraries'),
				viewDef ? Promise.resolve(null) : fetch('/api/manifest'),
			]);

			if (manifestRes?.ok) {
				const manifest = await manifestRes.json();
				viewDef = manifest.views.collection;
			}

			if (colsRes.ok) {
				const allCols: Collection[] = await colsRes.json();
				collection = allCols.find((c) => c.id === collectionId) ?? null;
			}

			if (itemsRes.ok) {
				items = await itemsRes.json();
				if (!searchQuery.trim()) totalCount = items.length;
			}

			if (libsRes.ok) {
				userLibraries = await libsRes.json();
			}

			if (sourcesRes.ok) {
				const sources: SourceInfo[] = await sourcesRes.json();
				const disc = new Set<string>();
				for (const s of sources) {
					if (s.type === 'smb' && !s.connected) disc.add(s.id);
				}
				disconnectedSources = disc;
			}
		} catch (err) {
			console.error('Failed to load collection:', err);
		} finally {
			loading = false;
		}
	}

	async function removeFromCollection(item: EnrichedItem) {
		try {
			await fetch(`/api/collections/items?collectionId=${collectionId}&sourceId=${item.sourceId}&workId=${encodeURIComponent(item.workId)}`, {
				method: 'DELETE',
			});
			items = items.filter((i) => !(i.sourceId === item.sourceId && i.workId === item.workId));
		} catch (err) {
			console.error('Failed to remove from collection:', err);
		}
	}

	// Group items by library (presentation concern — data already sorted/filtered server-side)
	let groupedView = $derived(() => {
		const groups: Array<{ library: UserLibrary; items: EnrichedItem[] }> = [];
		for (const lib of userLibraries) {
			const libItems = items.filter((i) => i.libraryId === lib.id);
			if (libItems.length > 0) groups.push({ library: lib, items: libItems });
		}
		const unassigned = items.filter((i) => !i.libraryId);
		return { groups, unassigned };
	});

	$effect(() => {
		void collectionId;
		void sortBy;
		void searchQuery;
		void $nsfwMode;
		loadCollection();
	});
</script>

<div class="collection-header">
	<h2 class="title is-4 mb-0">{collection?.name ?? 'Collection'}</h2>
	<span class="item-count">{totalCount} titles</span>
	<GearToggle active={managing} onclick={() => managing = !managing} />
</div>

{#if managing && collection}
	<EntitySettings
		entityType="collection"
		entityId={collection.id}
		name={collection.name}
		readerDirection={collection.readerDirection ?? ''}
		readerOffset={collection.readerOffset != null ? String(collection.readerOffset) : ''}
		coverArtMode={collection.coverArtMode ?? ''}
		onupdate={loadCollection}
		ondelete={() => goto('/library')}
	/>
{/if}

<div class="controls-row">
	<div class="search-box">
		<input
			class="input is-small"
			type="text"
			placeholder="Search collection..."
			bind:value={searchQuery}
		/>
	</div>
	<div class="sort-tabs">
		{#each sortOptions as opt}
			<button class="tab-btn" class:active={sortBy === opt.value} onclick={() => sortBy = opt.value}>{opt.label}</button>
		{/each}
	</div>
</div>

{#if loading}
	<div class="has-text-centered py-6">
		<div class="loader-inline"></div>
	</div>
{:else if items.length === 0}
	{#if totalCount === 0}
		<div class="empty-state">
			<p class="has-text-grey">This collection is empty. Add titles from their detail pages.</p>
		</div>
	{:else}
		<p class="has-text-grey mt-4">No results for "{searchQuery}"</p>
	{/if}
{:else}
	{@const gv = groupedView()}
	{#each gv.groups as group}
		<div class="library-group">
			<div class="library-group-header">
				<h3 class="group-title">{group.library.name}</h3>
				<span class="group-count">{group.items.length}</span>
			</div>
			<div class="work-grid">
				{#each group.items as item}
					<div class="card-wrap">
						<WorkCard
							title={item.title}
							coverUrl={item.coverUrl ?? undefined}
							sourceId={item.sourceId}
							workId={item.workId}
							href="/work/{item.sourceId}/{encodeURIComponent(item.workId)}"
							badge={item.unreadCount ? String(item.unreadCount) : undefined}
							nsfw={item.nsfw}
							unavailable={disconnectedSources.has(item.sourceId)}
						/>
						{#if managing}
							<button class="remove-btn" onclick={() => removeFromCollection(item)} title="Remove from collection">&times;</button>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/each}
	{#if gv.unassigned.length > 0}
		<div class="library-group">
			{#if gv.groups.length > 0}
				<div class="library-group-header">
					<h3 class="group-title">Unsorted</h3>
					<span class="group-count">{gv.unassigned.length}</span>
				</div>
			{/if}
			<div class="work-grid">
				{#each gv.unassigned as item}
					<div class="card-wrap">
						<WorkCard
							title={item.title}
							coverUrl={item.coverUrl ?? undefined}
							sourceId={item.sourceId}
							workId={item.workId}
							href="/work/{item.sourceId}/{encodeURIComponent(item.workId)}"
							badge={item.unreadCount ? String(item.unreadCount) : undefined}
							nsfw={item.nsfw}
							unavailable={disconnectedSources.has(item.sourceId)}
						/>
						{#if managing}
							<button class="remove-btn" onclick={() => removeFromCollection(item)} title="Remove from collection">&times;</button>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
{/if}

<style>
	.collection-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}

	.item-count {
		font-size: 0.85rem;
		color: var(--text-secondary);
	}

	.controls-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
		flex-wrap: wrap;
	}

	.search-box { flex: 1; min-width: 150px; }
	.search-box .input { width: 100%; max-width: 300px; }

	.sort-tabs {
		display: flex;
		gap: 2px;
		background: var(--bg-secondary);
		border-radius: 6px;
		padding: 2px;
	}

	.tab-btn {
		padding: 6px 12px;
		border: none;
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
		border-radius: 4px;
		font-size: 0.8rem;
		transition: all 0.15s;
	}

	.tab-btn.active {
		background: var(--accent);
		color: #fff;
	}

	.library-group {
		margin-bottom: 24px;
	}

	.library-group-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--bg-secondary);
	}

	.group-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.group-count {
		font-size: 0.75rem;
		color: var(--text-secondary);
		background: var(--bg-secondary);
		padding: 1px 6px;
		border-radius: 8px;
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

	.card-wrap {
		position: relative;
	}

	.remove-btn {
		position: absolute;
		top: 4px;
		right: 4px;
		z-index: 10;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 50%;
		background: rgba(231, 76, 60, 0.9);
		color: #fff;
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.remove-btn:hover {
		background: #e74c3c;
	}

	@media (max-width: 600px) {
		.search-box .input { max-width: none; }
	}
</style>
