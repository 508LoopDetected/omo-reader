<script lang="ts">
	import WorkCard from '$lib/components/library/WorkCard.svelte';
	import GearToggle from '$lib/components/GearToggle.svelte';
	import EntitySettings from '$lib/components/EntitySettings.svelte';
	import { goto } from '$lib/router.js';
	import type { UserLibrary, Collection, ViewDef } from '@omo/core';
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

	let libraryId = $derived(params.libraryId ?? '');
	let userLibrary = $state<UserLibrary | null>(null);
	let items: EnrichedItem[] = $state([]);
	let totalCount = $state(0);
	let allCollections = $state<Collection[]>([]);
	let itemCollectionMap = $state(new Map<number, Set<string>>());
	let disconnectedSources = $state(new Set<string>());
	let loading = $state(true);
	let searchQuery = $state('');
	let sortBy = $state<string>('recent');
	let viewMode = $state<string>('all');
	let viewDef = $state<ViewDef | null>(null);

	let sortControl = $derived(viewDef?.controls.find(c => c.key === 'sort'));
	let sortOptions = $derived(sortControl?.options ?? [
		{ value: 'recent', label: 'Recent' },
		{ value: 'added', label: 'Added' },
		{ value: 'title', label: 'A-Z' },
	]);
	let viewModeControl = $derived(viewDef?.controls.find(c => c.key === 'viewMode'));
	let viewModeOptions = $derived(viewModeControl?.options ?? [
		{ value: 'all', label: 'All' },
		{ value: 'collection', label: 'By Collection' },
	]);

	async function loadLibrary() {
		loading = true;
		items = [];
		try {
			const params = new URLSearchParams({
				enriched: 'true',
				libraryId,
				sort: sortBy,
				nsfwMode: $nsfwMode,
			});
			if (searchQuery.trim()) params.set('search', searchQuery.trim());

			const [libRes, sourcesRes, userLibRes, colsRes, memberRes, manifestRes] = await Promise.all([
				fetch(`/api/library?${params}`),
				fetch('/api/sources'),
				fetch('/api/user-libraries'),
				fetch('/api/collections'),
				fetch(`/api/collections/items?libraryId=${encodeURIComponent(libraryId)}`),
				viewDef ? Promise.resolve(null) : fetch('/api/manifest'),
			]);

			if (manifestRes?.ok) {
				const manifest = await manifestRes.json();
				viewDef = manifest.views.libraryById;
			}

			if (libRes.ok) {
				items = await libRes.json();
				if (!searchQuery.trim()) totalCount = items.length;
			}

			if (userLibRes.ok) {
				const libs: UserLibrary[] = await userLibRes.json();
				userLibrary = libs.find((l) => l.id === libraryId) ?? null;
			}

			if (colsRes.ok) {
				allCollections = await colsRes.json();
			}

			if (memberRes.ok) {
				const rows: { collectionId: string; libraryItemId: number }[] = await memberRes.json();
				const map = new Map<number, Set<string>>();
				for (const r of rows) {
					let set = map.get(r.libraryItemId);
					if (!set) { set = new Set(); map.set(r.libraryItemId, set); }
					set.add(r.collectionId);
				}
				itemCollectionMap = map;
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
			console.error('Failed to load library:', err);
		} finally {
			loading = false;
		}
	}

	let collectionGrouped = $derived(() => {
		const groups: Array<{ collection: Collection; items: EnrichedItem[] }> = [];

		for (const col of allCollections) {
			const colItems = items.filter((item) => {
				const memberships = itemCollectionMap.get(item.id);
				return memberships?.has(col.id);
			});
			if (colItems.length > 0) groups.push({ collection: col, items: colItems });
		}

		const collectedIds = new Set<number>();
		for (const [itemId] of itemCollectionMap) collectedIds.add(itemId);
		const uncollected = items.filter((item) => !collectedIds.has(item.id));

		return { groups, uncollected };
	});

	$effect(() => {
		void libraryId;
		void sortBy;
		void searchQuery;
		void $nsfwMode;
		loadLibrary();
	});
</script>

<div class="library-header">
	<h2 class="title is-4 mb-0">{userLibrary?.name ?? 'Library'}</h2>
	{#if userLibrary}
		<span class="type-badge">{userLibrary.type}</span>
	{/if}
	<span class="item-count">{totalCount} titles</span>
	<GearToggle active={managing} onclick={() => managing = !managing} />
</div>

{#if managing && userLibrary}
	<EntitySettings
		entityType="library"
		entityId={userLibrary.id}
		name={userLibrary.name}
		nsfw={userLibrary.nsfw ?? false}
		readerDirection={userLibrary.readerDirection ?? ''}
		readerOffset={userLibrary.readerOffset != null ? String(userLibrary.readerOffset) : ''}
		coverArtMode={userLibrary.coverArtMode ?? ''}
		onupdate={loadLibrary}
		ondelete={() => goto('/library')}
	/>
{/if}

<div class="controls-row">
	<div class="search-box">
		<input
			class="input is-small"
			type="text"
			placeholder="Search library..."
			bind:value={searchQuery}
		/>
	</div>
	<div class="sort-tabs">
		{#each sortOptions as opt}
			<button class="tab-btn" class:active={sortBy === opt.value} onclick={() => sortBy = opt.value}>{opt.label}</button>
		{/each}
	</div>
	<div class="sort-tabs">
		{#each viewModeOptions as opt}
			<button class="tab-btn" class:active={viewMode === opt.value} onclick={() => viewMode = opt.value}>{opt.label}</button>
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
			<p class="has-text-grey">This library is empty. Browse <a href="/sources">sources</a> and add titles to this library.</p>
		</div>
	{:else}
		<p class="has-text-grey mt-4">No results for "{searchQuery}"</p>
	{/if}
{:else if viewMode === 'all'}
	<div class="work-grid">
		{#each items as item}
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
		{/each}
	</div>
{:else}
	{@const gv = collectionGrouped()}
	{#each gv.groups as group}
		<div class="library-group">
			<div class="library-group-header">
				<h3 class="group-title">{group.collection.name}</h3>
				<span class="group-count">{group.items.length}</span>
			</div>
			<div class="work-grid">
				{#each group.items as item}
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
				{/each}
			</div>
		</div>
	{/each}
	{#if gv.uncollected.length > 0}
		<div class="library-group">
			<div class="library-group-header">
				<h3 class="group-title">Uncollected</h3>
				<span class="group-count">{gv.uncollected.length}</span>
			</div>
			<div class="work-grid">
				{#each gv.uncollected as item}
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
				{/each}
			</div>
		</div>
	{/if}
	{#if gv.groups.length === 0 && gv.uncollected.length === 0}
		<p class="has-text-grey mt-4">No results for "{searchQuery}"</p>
	{/if}
{/if}

<style>
	.library-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}

	.type-badge {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		padding: 2px 8px;
		border-radius: 4px;
		background: var(--accent);
		color: #fff;
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

	@media (max-width: 600px) {
		.search-box .input { max-width: none; }
	}
</style>
