<script lang="ts">
	import WorkCard from '$lib/components/library/WorkCard.svelte';
	import CollectionCard from '$lib/components/library/CollectionCard.svelte';
	import HeroBanner from '$lib/components/library/HeroBanner.svelte';
	import CarouselRow from '$lib/components/CarouselRow.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ControlsRow from '$lib/components/ControlsRow.svelte';
	import SortTabs from '$lib/components/SortTabs.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import InlineCreateForm from '$lib/components/InlineCreateForm.svelte';
	import type { UserLibrary, Collection, ViewDef } from '@omo/core';
	import { nsfwMode } from '$lib/stores/nsfw.js';

	interface ContinueItem {
		sourceId: string;
		workId: string;
		chapterId: string;
		page: number;
		totalPages: number;
		updatedAt: string;
		title?: string;
		chapterTitle?: string;
		coverUrl?: string;
		bannerUrl?: string;
		nsfw?: boolean;
	}

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

	interface CollectionMembership {
		collectionId: string;
		libraryItemId: number;
	}

	let continueItems: ContinueItem[] = $state([]);
	let items: EnrichedItem[] = $state([]);
	let totalCount = $state(0);
	let userLibraries: UserLibrary[] = $state([]);
	let allCollections: Collection[] = $state([]);
	let collectionMemberships: CollectionMembership[] = $state([]);
	let collectionDisplay = $state<string>('grouped');
	let disconnectedSources = $state(new Set<string>());
	let loading = $state(true);
	let sortBy = $state<string>('title');
	let viewDef = $state<ViewDef | null>(null);

	let libraryForm: InlineCreateForm;
	let collectionForm: InlineCreateForm;

	let sortControl = $derived(viewDef?.controls.find(c => c.key === 'sort'));
	let sortOptions = $derived(sortControl?.options ?? [
		{ value: 'title', label: 'A-Z' },
		{ value: 'recent', label: 'Recent' },
		{ value: 'added', label: 'Added' },
	]);

	async function loadLibrary() {
		loading = true;
		items = [];
		try {
			const params = new URLSearchParams({
				enriched: 'true',
				sort: sortBy,
				nsfwMode: $nsfwMode,
			});

			const [libRes, sourcesRes, libsRes, manifestRes, colsRes, memRes, homeRes] = await Promise.all([
				fetch(`/api/library?${params}`),
				fetch('/api/sources'),
				fetch('/api/user-libraries'),
				viewDef ? Promise.resolve(null) : fetch('/api/manifest'),
				fetch('/api/collections'),
				fetch('/api/collections/items'),
				fetch(`/api/home?nsfwMode=${$nsfwMode}`),
			]);

			if (homeRes.ok) {
				const homeData: { continueReading: ContinueItem[] } = await homeRes.json();
				continueItems = homeData.continueReading;
			}

			if (manifestRes?.ok) {
				const manifest = await manifestRes.json();
				viewDef = manifest.views.library;
				if (viewDef) {
					const sortDef = viewDef.controls.find((c: { key: string }) => c.key === 'sort');
					if (sortDef) sortBy = sortDef.defaultValue;
				}
				const displayVal = manifest.settings.values['library.collectionDisplay'];
				if (displayVal) collectionDisplay = displayVal;
			}

			if (libRes.ok) {
				items = await libRes.json();
				totalCount = items.length;
			}

			if (libsRes.ok) {
				userLibraries = await libsRes.json();
			}

			if (colsRes.ok) {
				allCollections = await colsRes.json();
			}

			if (memRes.ok) {
				collectionMemberships = await memRes.json();
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

	async function createLibrary(values: Record<string, string>) {
		try {
			const res = await fetch('/api/user-libraries', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(values),
			});
			if (res.ok) {
				window.dispatchEvent(new CustomEvent('libraries-changed'));
				await loadLibrary();
			}
		} catch (err) {
			console.error('Failed to create library:', err);
		}
	}

	async function createCollection(values: Record<string, string>) {
		try {
			const res = await fetch('/api/collections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(values),
			});
			if (res.ok) {
				window.dispatchEvent(new CustomEvent('collections-changed'));
				await loadLibrary();
			}
		} catch (err) {
			console.error('Failed to create collection:', err);
		}
	}

	let hasLibraries = $derived(() => userLibraries.length > 0);

	/** Build membership maps from collectionMemberships data. */
	let membershipMaps = $derived(() => {
		const itemToCollections = new Map<number, Set<string>>();
		const collectionToItems = new Map<string, Set<number>>();
		for (const m of collectionMemberships) {
			if (!itemToCollections.has(m.libraryItemId)) {
				itemToCollections.set(m.libraryItemId, new Set());
			}
			itemToCollections.get(m.libraryItemId)!.add(m.collectionId);
			if (!collectionToItems.has(m.collectionId)) {
				collectionToItems.set(m.collectionId, new Set());
			}
			collectionToItems.get(m.collectionId)!.add(m.libraryItemId);
		}
		return { itemToCollections, collectionToItems };
	});

	/** Collection cards to show in the library grid. */
	let collectionCards = $derived(() => {
		if (collectionDisplay === 'hidden') return [];
		const { collectionToItems } = membershipMaps();
		return allCollections
			.filter(col => collectionToItems.has(col.id))
			.map(col => {
				const memberIds = collectionToItems.get(col.id)!;
				const colItems = items.filter(i => memberIds.has(i.id));
				return {
					id: col.id,
					name: col.name,
					coverUrls: colItems.map(i => i.coverUrl),
					count: colItems.length,
				};
			})
			.filter(c => c.count > 0);
	});

	/** Items to show individually (filtered when grouped mode hides collected items). */
	let displayItems = $derived(() => {
		if (collectionDisplay !== 'grouped') return items;
		const { itemToCollections } = membershipMaps();
		return items.filter(i => !itemToCollections.has(i.id));
	});

	/** Group display items by UserLibrary. */
	let libraryGroupedView = $derived(() => {
		if (!hasLibraries()) return null;
		const visibleItems = displayItems();
		const groups: Array<{ library: UserLibrary; items: EnrichedItem[] }> = [];
		for (const lib of userLibraries) {
			const libItems = visibleItems.filter((i) => i.libraryId === lib.id);
			groups.push({ library: lib, items: libItems });
		}
		const unassigned = visibleItems.filter((i) => !i.libraryId);
		return { groups, unassigned };
	});

	async function removeFromLibrary(item: EnrichedItem) {
		await fetch(`/api/library?sourceId=${item.sourceId}&workId=${encodeURIComponent(item.workId)}`, { method: 'DELETE' });
		items = items.filter(i => i !== item);
		totalCount = Math.max(0, totalCount - 1);
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

	$effect(() => {
		void sortBy;
		void $nsfwMode;
		loadLibrary();
	});
</script>

{#if continueItems.length > 0}
	<HeroBanner items={continueItems} onDismiss={dismissItem} onReset={resetItem} />
{/if}

<PageHeader title="Library" count={totalCount}>
	{#snippet actions()}
		<button class="btn btn-sm preset-filled-primary-500" onclick={() => libraryForm.toggle()}>Add Library</button>
		{#if collectionDisplay !== 'hidden'}
			<button class="btn btn-sm preset-tonal-secondary" onclick={() => collectionForm.toggle()}>Add Collection</button>
		{/if}
	{/snippet}
</PageHeader>

<InlineCreateForm
	bind:this={libraryForm}
	fields={[
		{ key: 'name', label: 'Library Name', placeholder: 'Manga', required: true },
		{ key: 'type', label: 'Type', type: 'select', options: [{ value: 'manga', label: 'Manga' }, { value: 'western', label: 'Western' }], defaultValue: 'manga' },
	]}
	submitLabel="Create Library"
	onsubmit={createLibrary}
/>

<InlineCreateForm
	bind:this={collectionForm}
	fields={[
		{ key: 'name', label: 'Collection Name', placeholder: 'Favorites', required: true },
	]}
	submitLabel="Create Collection"
	onsubmit={createCollection}
/>

<ControlsRow>
	<SortTabs options={sortOptions} value={sortBy} onchange={(v) => sortBy = v} />
</ControlsRow>

{#if loading}
	<LoadingSpinner />
{:else if items.length === 0}
	{#if totalCount === 0}
		<EmptyState>
			<p class="text-surface-500">Your library is empty. Browse <a href="/sources">sources</a> to add titles, or use the buttons above to create libraries and collections.</p>
		</EmptyState>
	{/if}
{:else if libraryGroupedView()}
	{@const gv = libraryGroupedView()!}
	{@const cards = collectionCards()}
	{#if cards.length > 0}
		<CarouselRow title="Collections" count={cards.length}>
			{#each cards as card}
				<CollectionCard
					name={card.name}
					href="/collection/{card.id}"
					coverUrls={card.coverUrls}
					count={card.count}
				/>
			{/each}
		</CarouselRow>
	{/if}
	{#each gv.groups as group}
		{#if group.items.length > 0}
			<CarouselRow title={group.library.name} count={group.items.length}>
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
			</CarouselRow>
		{/if}
	{/each}

	{#if gv.unassigned.length > 0}
		<CarouselRow title="Unassigned" titleClass="muted">
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
					onRemove={() => removeFromLibrary(item)}
				/>
			{/each}
		</CarouselRow>
	{/if}
{:else}
	<CarouselRow title="Library" count={displayItems().length + collectionCards().length}>
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
			/>
		{/each}
	</CarouselRow>
{/if}
