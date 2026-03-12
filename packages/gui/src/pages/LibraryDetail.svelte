<script lang="ts">
	import WorkCard from '$lib/components/library/WorkCard.svelte';
	import CollectionCard from '$lib/components/library/CollectionCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ControlsRow from '$lib/components/ControlsRow.svelte';
	import SortTabs from '$lib/components/SortTabs.svelte';
	import WorkGrid from '$lib/components/WorkGrid.svelte';
	import GroupedGrid from '$lib/components/GroupedGrid.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import ReaderOverrides from '$lib/components/ReaderOverrides.svelte';
	import DangerAction from '$lib/components/DangerAction.svelte';
	import { goto } from '$lib/router.js';
	import type { UserLibrary, Collection, ViewDef } from '@omo/core';
	import { nsfwMode } from '$lib/stores/nsfw.js';

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
	let collectionDisplay = $state<string>('grouped');
	let disconnectedSources = $state(new Set<string>());
	let loading = $state(true);
	let sortBy = $state<string>('title');
	let viewMode = $state<string>('all');
	let viewDef = $state<ViewDef | null>(null);
	let showSettings = $state(false);

	// Inline title editing
	let editingName = $state(false);
	let editName = $state('');

	let sortControl = $derived(viewDef?.controls.find(c => c.key === 'sort'));
	let sortOptions = $derived(sortControl?.options ?? [
		{ value: 'title', label: 'A-Z' },
		{ value: 'recent', label: 'Recent' },
		{ value: 'added', label: 'Added' },
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
				const displayVal = manifest.settings.values['library.collectionDisplay'];
				if (displayVal) collectionDisplay = displayVal;
			}

			if (libRes.ok) {
				items = await libRes.json();
				totalCount = items.length;
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

	async function updateField(field: string, value: string | null) {
		try {
			await fetch('/api/user-libraries', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: libraryId, [field]: value }),
			});
			window.dispatchEvent(new CustomEvent('libraries-changed'));
			await loadLibrary();
		} catch (err) {
			console.error('Failed to update library:', err);
		}
	}

	function startEditName() {
		editName = userLibrary?.name ?? '';
		editingName = true;
	}

	function saveName() {
		editingName = false;
		const trimmed = editName.trim();
		if (trimmed && trimmed !== userLibrary?.name) {
			updateField('name', trimmed);
		}
	}

	function handleNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
		if (e.key === 'Escape') { editingName = false; }
	}

	async function doDelete() {
		await fetch(`/api/user-libraries?id=${libraryId}`, { method: 'DELETE' });
		window.dispatchEvent(new CustomEvent('libraries-changed'));
		goto('/');
	}

	function handleReaderChange(field: 'direction' | 'offset' | 'coverArtMode', value: string | null) {
		const fieldMap = { direction: 'readerDirection', offset: 'readerOffset', coverArtMode: 'coverArtMode' };
		updateField(fieldMap[field], value);
	}

	/** Collection cards to show in the "All" view grid. */
	let collectionCards = $derived(() => {
		if (collectionDisplay === 'hidden') return [];

		// Invert itemCollectionMap: collectionId -> items in this library
		const colToItems = new Map<string, EnrichedItem[]>();
		for (const item of items) {
			const colIds = itemCollectionMap.get(item.id);
			if (!colIds) continue;
			for (const colId of colIds) {
				if (!colToItems.has(colId)) colToItems.set(colId, []);
				colToItems.get(colId)!.push(item);
			}
		}

		return allCollections
			.filter(col => colToItems.has(col.id))
			.map(col => {
				const colItems = colToItems.get(col.id)!;
				return {
					id: col.id,
					name: col.name,
					coverUrls: colItems.map(i => i.coverUrl),
					count: colItems.length,
				};
			});
	});

	/** Items to show individually in the "All" view (filtered when grouped). */
	let displayItems = $derived(() => {
		if (collectionDisplay !== 'grouped') return items;
		// In grouped mode, hide items that belong to any collection
		const collectedIds = new Set<number>();
		for (const [itemId] of itemCollectionMap) collectedIds.add(itemId);
		return items.filter(item => !collectedIds.has(item.id));
	});

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

	async function removeFromLibrary(item: EnrichedItem) {
		await fetch(`/api/library?sourceId=${item.sourceId}&workId=${encodeURIComponent(item.workId)}`, { method: 'DELETE' });
		items = items.filter(i => i !== item);
		totalCount = Math.max(0, totalCount - 1);
	}

	$effect(() => {
		void libraryId;
		void sortBy;
		void $nsfwMode;
		loadLibrary();
	});
</script>

<PageHeader
	title={editingName ? '' : (userLibrary?.name ?? 'Library')}
	badge={userLibrary?.type ?? ''}
	count={totalCount}
>
	{#snippet actions()}
		<button class="settings-link" onclick={() => showSettings = !showSettings}>
			{showSettings ? 'Hide Settings' : 'Settings'}
		</button>
	{/snippet}
</PageHeader>

{#if editingName}
	<div class="mb-3">
		<input
			class="input text-sm px-2 py-1 rounded"
			type="text"
			bind:value={editName}
			onblur={saveName}
			onkeydown={handleNameKeydown}
		/>
	</div>
{/if}

{#if showSettings && userLibrary}
	<div class="card bg-surface-100-900 rounded-lg p-4 mb-4 flex flex-col gap-3">
		<div class="flex items-center justify-between gap-4">
			<span class="text-sm">Name</span>
			<button class="btn btn-sm preset-tonal-surface" onclick={startEditName}>Edit Name</button>
		</div>
		<div class="flex items-center justify-between gap-4">
			<span class="text-sm">NSFW</span>
			<button
				class="btn btn-sm {userLibrary.nsfw ? 'preset-filled-primary-500' : 'preset-tonal-primary'}"
				onclick={() => updateField('nsfw', userLibrary!.nsfw ? 'false' : 'true')}
			>
				{userLibrary.nsfw ? 'On' : 'Off'}
			</button>
		</div>
		<ReaderOverrides
			layout="stacked"
			direction={userLibrary.readerDirection ?? ''}
			offset={userLibrary.readerOffset != null ? String(userLibrary.readerOffset) : ''}
			coverArtMode={userLibrary.coverArtMode ?? ''}
			onchange={handleReaderChange}
		/>
		<div class="danger-section">
			<DangerAction
				label="Delete Library"
				confirmMessage="Delete this library? This cannot be undone."
				confirmLabel="Yes, delete"
				onconfirm={doDelete}
			/>
		</div>
	</div>
{/if}

<ControlsRow>
	<SortTabs options={sortOptions} value={sortBy} onchange={(v) => sortBy = v} />
	<SortTabs options={viewModeOptions} value={viewMode} onchange={(v) => viewMode = v} />
</ControlsRow>

{#if loading}
	<LoadingSpinner />
{:else if items.length === 0}
	<EmptyState>
		<p class="text-surface-500">This library is empty. Browse <a href="/sources">sources</a> and add titles to this library.</p>
	</EmptyState>
{:else if viewMode === 'all'}
	<WorkGrid>
		{#each collectionCards() as card}
			<CollectionCard
				name={card.name}
				href="/collection/{card.id}"
				coverUrls={card.coverUrls}
				count={card.count}
			/>
		{/each}
		{#each displayItems() as item}
			<WorkCard
				title={item.title}
				coverUrl={item.coverUrl ?? undefined}
				sourceId={item.sourceId}
				workId={item.workId}
				href="/work/{item.sourceId}/{encodeURIComponent(item.workId)}"
				badge={item.unreadCount ? String(item.unreadCount) : undefined}
				nsfw={item.nsfw}
				unavailable={disconnectedSources.has(item.sourceId)}
				onRemove={() => removeFromLibrary(item)}
			/>
		{/each}
	</WorkGrid>
{:else}
	{@const gv = collectionGrouped()}
	{#each gv.groups as group}
		<GroupedGrid title={group.collection.name} count={group.items.length}>
			<WorkGrid>
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
			</WorkGrid>
		</GroupedGrid>
	{/each}
	{#if gv.uncollected.length > 0}
		<GroupedGrid title="Uncollected" count={gv.uncollected.length}>
			<WorkGrid>
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
			</WorkGrid>
		</GroupedGrid>
	{/if}
{/if}

<style>
	.settings-link {
		background: none;
		border: none;
		color: var(--color-primary-500);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 4px 8px;
	}

	.settings-link:hover {
		color: var(--color-primary-400);
	}

	.danger-section {
		border-top: 1px solid rgba(231, 76, 60, 0.2);
		padding-top: 16px;
	}

</style>
