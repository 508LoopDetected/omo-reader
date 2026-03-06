<script lang="ts">
	import WorkCard from '$lib/components/library/WorkCard.svelte';
	import GearToggle from '$lib/components/GearToggle.svelte';
	import ManagementPanel from '$lib/components/ManagementPanel.svelte';
	import type { UserLibrary, ViewDef } from '@omo/core';
	import { nsfwMode } from '$lib/stores/nsfw.js';

	let managing = $state(false);

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
	let searchQuery = $state('');
	let sortBy = $state<string>('recent');
	let viewDef = $state<ViewDef | null>(null);

	let sortControl = $derived(viewDef?.controls.find(c => c.key === 'sort'));
	let sortOptions = $derived(sortControl?.options ?? [
		{ value: 'recent', label: 'Recent' },
		{ value: 'added', label: 'Added' },
		{ value: 'title', label: 'A-Z' },
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
			if (searchQuery.trim()) params.set('search', searchQuery.trim());

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
			console.error('Failed to load library:', err);
		} finally {
			loading = false;
		}
	}

	let hasLibraries = $derived(() => userLibraries.length > 0);

	// Group items by library for grouped view (grouping is a presentation concern)
	let groupedView = $derived(() => {
		if (!hasLibraries() || searchQuery.trim()) {
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

	$effect(() => {
		void sortBy;
		void searchQuery;
		void $nsfwMode;
		loadLibrary();
	});
</script>

<div class="library-header">
	<h2 class="title is-4 mb-0">Library</h2>
	<span class="item-count">{totalCount} titles</span>
	<GearToggle active={managing} onclick={() => managing = !managing} />
</div>

{#if managing}
	<ManagementPanel sectionIds={['libraries', 'collections']} onchange={loadLibrary} />
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
</div>

{#if loading}
	<div class="has-text-centered py-6">
		<div class="loader-inline"></div>
	</div>
{:else if items.length === 0}
	{#if totalCount === 0}
		<div class="empty-state">
			<p class="has-text-grey">Your library is empty. Browse <a href="/sources">sources</a> to add titles, or use the gear icon to create libraries and collections.</p>
		</div>
	{:else}
		<p class="has-text-grey mt-4">No results for "{searchQuery}"</p>
	{/if}
{:else if groupedView()}
	{@const gv = groupedView()!}
	{#each gv.groups as group}
		{#if group.items.length > 0}
			<div class="library-group">
				<div class="library-group-header">
					<h3 class="group-title">{group.library.name}</h3>
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
		{/if}
	{/each}

	{#if gv.unassigned.length > 0}
		<div class="library-group">
			<div class="library-group-header">
				<h3 class="group-title has-text-grey">Unassigned</h3>
			</div>
			<div class="work-grid">
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
					/>
				{/each}
			</div>
		</div>
	{/if}
{:else}
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
{/if}

<style>
	.library-header {
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
