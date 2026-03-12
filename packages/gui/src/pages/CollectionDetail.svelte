<script lang="ts">
	import WorkCard from '$lib/components/library/WorkCard.svelte';
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
	import type { Collection, UserLibrary, ViewDef } from '@omo/core';
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

	let collectionId = $derived(params.collectionId ?? '');
	let collection = $state<Collection | null>(null);
	let items: EnrichedItem[] = $state([]);
	let totalCount = $state(0);
	let userLibraries: UserLibrary[] = $state([]);
	let disconnectedSources = $state(new Set<string>());
	let loading = $state(true);
	let sortBy = $state<string>('title');
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
				totalCount = items.length;
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

	async function updateField(field: string, value: string | null) {
		try {
			await fetch('/api/collections', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: collectionId, [field]: value }),
			});
			window.dispatchEvent(new CustomEvent('collections-changed'));
			await loadCollection();
		} catch (err) {
			console.error('Failed to update collection:', err);
		}
	}

	function startEditName() {
		editName = collection?.name ?? '';
		editingName = true;
	}

	function saveName() {
		editingName = false;
		const trimmed = editName.trim();
		if (trimmed && trimmed !== collection?.name) {
			updateField('name', trimmed);
		}
	}

	function handleNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
		if (e.key === 'Escape') { editingName = false; }
	}

	async function doDelete() {
		await fetch(`/api/collections?id=${collectionId}`, { method: 'DELETE' });
		window.dispatchEvent(new CustomEvent('collections-changed'));
		goto('/');
	}

	function handleReaderChange(field: 'direction' | 'offset' | 'coverArtMode', value: string | null) {
		const fieldMap = { direction: 'readerDirection', offset: 'readerOffset', coverArtMode: 'coverArtMode' };
		updateField(fieldMap[field], value);
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
		void $nsfwMode;
		loadCollection();
	});
</script>

<PageHeader title={editingName ? '' : (collection?.name ?? 'Collection')} count={totalCount}>
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

{#if showSettings && collection}
	<div class="card bg-surface-100-900 rounded-lg p-4 mb-4 flex flex-col gap-3">
		<div class="flex items-center justify-between gap-4">
			<span class="text-sm">Name</span>
			<button class="btn btn-sm preset-tonal-surface" onclick={startEditName}>Edit Name</button>
		</div>
		<ReaderOverrides
			layout="stacked"
			direction={collection.readerDirection ?? ''}
			offset={collection.readerOffset != null ? String(collection.readerOffset) : ''}
			coverArtMode={collection.coverArtMode ?? ''}
			onchange={handleReaderChange}
		/>
		<div class="danger-section">
			<DangerAction
				label="Delete Collection"
				confirmMessage="Delete this collection? This cannot be undone."
				confirmLabel="Yes, delete"
				onconfirm={doDelete}
			/>
		</div>
	</div>
{/if}

<ControlsRow>
	<SortTabs options={sortOptions} value={sortBy} onchange={(v) => sortBy = v} />
</ControlsRow>

{#if loading}
	<LoadingSpinner />
{:else if items.length === 0}
	{#if totalCount === 0}
		<EmptyState>
			<p class="text-surface-500">This collection is empty. Add titles from their detail pages.</p>
		</EmptyState>
	{/if}
{:else}
	{@const gv = groupedView()}
	{#each gv.groups as group}
		<GroupedGrid title={group.library.name} count={group.items.length}>
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
						onRemove={() => removeFromCollection(item)}
					/>
				{/each}
			</WorkGrid>
		</GroupedGrid>
	{/each}
	{#if gv.unassigned.length > 0}
		<GroupedGrid title={gv.groups.length > 0 ? 'Unsorted' : ''} count={gv.groups.length > 0 ? gv.unassigned.length : undefined}>
			<WorkGrid>
				{#each gv.unassigned as item}
					<WorkCard
						title={item.title}
						coverUrl={item.coverUrl ?? undefined}
						sourceId={item.sourceId}
						workId={item.workId}
						href="/work/{item.sourceId}/{encodeURIComponent(item.workId)}"
						badge={item.unreadCount ? String(item.unreadCount) : undefined}
						nsfw={item.nsfw}
						unavailable={disconnectedSources.has(item.sourceId)}
						onRemove={() => removeFromCollection(item)}
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
