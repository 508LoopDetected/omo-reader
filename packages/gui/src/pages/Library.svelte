<script lang="ts">
	import WorkCard from '$lib/components/library/WorkCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ControlsRow from '$lib/components/ControlsRow.svelte';
	import SortTabs from '$lib/components/SortTabs.svelte';
	import WorkGrid from '$lib/components/WorkGrid.svelte';
	import GroupedGrid from '$lib/components/GroupedGrid.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import InlineCreateForm from '$lib/components/InlineCreateForm.svelte';
	import type { UserLibrary, ViewDef } from '@omo/core';
	import { nsfwMode } from '$lib/stores/nsfw.js';

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

	let items: EnrichedItem[] = $state([]);
	let totalCount = $state(0);
	let userLibraries: UserLibrary[] = $state([]);
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

			const [libRes, sourcesRes, libsRes, manifestRes] = await Promise.all([
				fetch(`/api/library?${params}`),
				fetch('/api/sources'),
				fetch('/api/user-libraries'),
				viewDef ? Promise.resolve(null) : fetch('/api/manifest'),
			]);

			if (manifestRes?.ok) {
				const manifest = await manifestRes.json();
				viewDef = manifest.views.library;
				if (viewDef) {
					const sortDef = viewDef.controls.find((c: { key: string }) => c.key === 'sort');
					if (sortDef) sortBy = sortDef.defaultValue;
				}
			}

			if (libRes.ok) {
				items = await libRes.json();
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

	let groupedView = $derived(() => {
		if (!hasLibraries()) {
			return null;
		}

		const groups: Array<{
			library: UserLibrary;
			items: EnrichedItem[];
		}> = [];

		for (const lib of userLibraries) {
			const libItems = items.filter((i) => i.libraryId === lib.id);
			groups.push({ library: lib, items: libItems });
		}

		const unassigned = items.filter((i) => !i.libraryId);

		return { groups, unassigned };
	});

	async function removeFromLibrary(item: EnrichedItem) {
		await fetch(`/api/library?sourceId=${item.sourceId}&workId=${encodeURIComponent(item.workId)}`, { method: 'DELETE' });
		items = items.filter(i => i !== item);
		totalCount = Math.max(0, totalCount - 1);
	}

	$effect(() => {
		void sortBy;
		void $nsfwMode;
		loadLibrary();
	});
</script>

<PageHeader title="Library" count={totalCount}>
	{#snippet actions()}
		<button class="btn btn-sm preset-filled-primary-500" onclick={() => libraryForm.toggle()}>Add Library</button>
		<button class="btn btn-sm preset-tonal-secondary" onclick={() => collectionForm.toggle()}>Add Collection</button>
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
{:else if groupedView()}
	{@const gv = groupedView()!}
	{#each gv.groups as group}
		{#if group.items.length > 0}
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
						/>
					{/each}
				</WorkGrid>
			</GroupedGrid>
		{/if}
	{/each}

	{#if gv.unassigned.length > 0}
		<GroupedGrid title="Unassigned" titleClass="muted">
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
						onRemove={() => removeFromLibrary(item)}
					/>
				{/each}
			</WorkGrid>
		</GroupedGrid>
	{/if}
{:else}
	<WorkGrid>
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
	</WorkGrid>
{/if}
