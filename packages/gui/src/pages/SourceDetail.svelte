<script lang="ts">
	import WorkCard from '$lib/components/library/WorkCard.svelte';
	import ControlsRow from '$lib/components/ControlsRow.svelte';
	import SortTabs from '$lib/components/SortTabs.svelte';
	import WorkGrid from '$lib/components/WorkGrid.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import type { WorkEntry, UserLibrary } from '@omo/core';
	import { nsfwMode } from '$lib/stores/nsfw.js';

	let { params }: { params: Record<string, string> } = $props();
	let sourceId = $derived(params.sourceId ?? '');
	let isLocalSource = $derived(sourceId.startsWith('local:') || sourceId.startsWith('smb:'));
	let works: WorkEntry[] = $state([]);
	let loading = $state(true);
	let currentPage = $state(1);
	let hasNextPage = $state(false);
	let mode = $state<'popular' | 'latest'>('popular');
	let searchQuery = $state('');
	let searching = $state(false);
	let sourceName = $state('');

	// Bulk add state
	let userLibraries: UserLibrary[] = $state([]);
	let showLibraryPicker = $state(false);
	let bulkAdding = $state(false);
	let bulkResult = $state<{ added: number; skipped: number; moved: number } | null>(null);

	async function loadUserLibraries() {
		try {
			const res = await fetch('/api/user-libraries');
			if (res.ok) userLibraries = await res.json();
		} catch { /* ignore */ }
	}

	async function bulkAdd(libraryId?: string) {
		bulkAdding = true;
		bulkResult = null;
		showLibraryPicker = false;
		try {
			const res = await fetch('/api/library/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sourceId, libraryId }),
			});
			if (res.ok) {
				const data = await res.json();
				bulkResult = { added: data.added, skipped: data.skipped, moved: data.moved ?? 0 };
			}
		} catch (err) {
			console.error('Bulk add failed:', err);
		} finally {
			bulkAdding = false;
		}
	}

	// Filters
	interface FilterOption { type_name: string; name: string; value: string; state?: unknown; }
	interface Filter { type_name: string; type?: string; name: string; state: unknown; values?: FilterOption[]; }
	let filters: Filter[] = $state([]);
	let showFilters = $state(false);

	async function loadFilters() {
		if (sourceId.startsWith('local:')) return;
		try {
			const res = await fetch(`/api/sources/${sourceId}/filters`);
			if (res.ok) filters = await res.json();
		} catch { /* ignore */ }
	}

	async function loadSourceName() {
		try {
			const res = await fetch('/api/sources');
			if (res.ok) {
				const sources: { id: string; name: string }[] = await res.json();
				const source = sources.find((s) => s.id === sourceId);
				sourceName = source?.name ?? sourceId;
			}
		} catch { /* ignore */ }
	}

	async function loadWorks(pageNum: number = 1) {
		loading = true;
		if (pageNum === 1) works = [];
		try {
			const res = await fetch(`/api/sources/${sourceId}/browse?page=${pageNum}&mode=${mode}`);
			if (res.ok) {
				const data = await res.json();
				if (pageNum === 1) {
					works = data.items;
				} else {
					works = [...works, ...data.items];
				}
				hasNextPage = data.hasNextPage;
				currentPage = pageNum;
			}
		} catch (err) {
			console.error('Failed to load:', err);
		} finally {
			loading = false;
		}
	}

	async function doSearch(pageNum: number = 1) {
		searching = true;
		loading = true;
		if (pageNum === 1) works = [];
		try {
			const hasActiveFilters = filters.some((f) => {
				if (f.type_name === 'SelectFilter' && f.state !== 0) return true;
				if (f.type_name === 'GroupFilter' && Array.isArray(f.state)) {
					return (f.state as FilterOption[]).some((o) => o.state && o.state !== 0);
				}
				if (f.type_name === 'CheckBox' && f.state) return true;
				if (f.type_name === 'TextFilter' && f.state) return true;
				return false;
			});

			let res: Response;
			if (hasActiveFilters) {
				res = await fetch(`/api/sources/${sourceId}/search`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ query: searchQuery, page: pageNum, filters }),
				});
			} else {
				res = await fetch(`/api/sources/${sourceId}/search?q=${encodeURIComponent(searchQuery)}&page=${pageNum}`);
			}
			if (res.ok) {
				const data = await res.json();
				if (pageNum === 1) {
					works = data.items;
				} else {
					works = [...works, ...data.items];
				}
				hasNextPage = data.hasNextPage;
				currentPage = pageNum;
			}
		} catch (err) {
			console.error('Search failed:', err);
		} finally {
			loading = false;
		}
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			doSearch(1);
		}
	}

	function switchMode(newMode: 'popular' | 'latest') {
		mode = newMode;
		searching = false;
		searchQuery = '';
		loadWorks(1);
	}

	function resetFilters() {
		loadFilters();
		showFilters = false;
	}

	function loadMore() {
		if (searching) {
			doSearch(currentPage + 1);
		} else {
			loadWorks(currentPage + 1);
		}
	}

	$effect(() => {
		void sourceId;
		works = [];
		currentPage = 1;
		searching = false;
		searchQuery = '';
		bulkResult = null;
		loadWorks(1);
		loadFilters();
		loadSourceName();
		loadUserLibraries();
	});

	// Re-fetch when global NSFW mode changes
	let prevNsfwMode: string | undefined;
	$effect(() => {
		const mode = $nsfwMode;
		if (prevNsfwMode !== undefined && mode !== prevNsfwMode) {
			if (searching) doSearch(1);
			else loadWorks(1);
		}
		prevNsfwMode = mode;
	});
</script>

<div class="source-header">
	<h2 class="h4">{sourceName || sourceId}</h2>
</div>

<ControlsRow>
	{#if !sourceId.startsWith('local:')}
		<SortTabs
			options={[{ value: 'popular', label: 'Popular' }, { value: 'latest', label: 'Latest' }]}
			value={searching ? '' : mode}
			onchange={(v) => switchMode(v as 'popular' | 'latest')}
		/>
	{/if}
	<div class="search-box">
		<input
			class="input text-sm px-2 py-1 rounded"
			type="text"
			placeholder="Search..."
			bind:value={searchQuery}
			onkeydown={handleSearchKeydown}
		/>
		<button class="btn btn-sm preset-filled-primary-500" onclick={() => doSearch(1)}>Search</button>
		{#if filters.length > 0}
			<button
				class="btn btn-sm preset-tonal-surface"
				class:preset-filled-secondary-500={showFilters}
				onclick={() => showFilters = !showFilters}
				title="Filters"
			>
				<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>
			</button>
		{/if}
	</div>
	{#if isLocalSource}
		<div class="bulk-add-wrapper">
			<button
				class="btn btn-sm preset-tonal-secondary"
				disabled={bulkAdding}
				onclick={() => {
					if (userLibraries.length > 0) {
						showLibraryPicker = !showLibraryPicker;
					} else {
						bulkAdd();
					}
				}}
			>
				{bulkAdding ? 'Adding...' : 'Add All to Library'}
			</button>
			{#if showLibraryPicker}
				<div class="library-picker">
					<button class="picker-option" onclick={() => bulkAdd()}>Default (no library)</button>
					{#each userLibraries as lib}
						<button class="picker-option" onclick={() => bulkAdd(lib.id)}>{lib.name}</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</ControlsRow>

{#if bulkResult}
	<div class="bulk-result">
		Added {bulkResult.added} title{bulkResult.added !== 1 ? 's' : ''}{bulkResult.moved > 0 ? `, ${bulkResult.moved} moved` : ''}{bulkResult.skipped > 0 ? `, ${bulkResult.skipped} already in library` : ''}
	</div>
{/if}

{#if showFilters && filters.length > 0}
	<div class="filters-panel">
		{#each filters as filter, i}
			{#if filter.type_name === 'HeaderFilter'}
				<div class="filter-header">{filter.name}</div>
			{:else if filter.type_name === 'SelectFilter' || filter.type_name === 'SortFilter'}
				<div class="filter-group">
					<label class="text-sm font-medium">{filter.name}</label>
					<select class="select text-sm px-2 py-1 rounded" onchange={(e) => {
						const target = e.target as HTMLSelectElement;
						filters[i] = { ...filter, state: parseInt(target.value) };
					}}>
						{#each (filter.values ?? []) as opt, j}
							<option value={j} selected={filter.state === j}>{opt.name}</option>
						{/each}
					</select>
				</div>
			{:else if filter.type_name === 'CheckBox'}
				<div class="filter-group">
					<label class="flex items-center gap-2 cursor-pointer text-sm">
						<input
							type="checkbox"
							checked={!!filter.state}
							onchange={(e) => {
								const target = e.target as HTMLInputElement;
								filters[i] = { ...filter, state: target.checked };
							}}
						/>
						{filter.name}
					</label>
				</div>
			{:else if filter.type_name === 'TextFilter'}
				<div class="filter-group">
					<label class="text-sm font-medium">{filter.name}</label>
					<input
						class="input text-sm px-2 py-1 rounded"
						type="text"
						value={String(filter.state ?? '')}
						oninput={(e) => {
							const target = e.target as HTMLInputElement;
							filters[i] = { ...filter, state: target.value };
						}}
					/>
				</div>
			{:else if filter.type_name === 'GroupFilter'}
				<details class="filter-group-collapsible">
					<summary class="text-sm font-medium">{filter.name}</summary>
					<div class="filter-checkboxes">
						{#each ((filter.state ?? []) as FilterOption[]) as opt, j}
							{#if opt.type_name === 'TriState'}
								<label class="tri-state" class:included={opt.state === 1} class:excluded={opt.state === 2}>
									<button
										class="tri-btn"
										onclick={() => {
											const states = (filter.state ?? []) as FilterOption[];
											const newState = ((opt.state as number ?? 0) + 1) % 3;
											const newStates = [...states];
											newStates[j] = { ...opt, state: newState };
											filters[i] = { ...filter, state: newStates };
										}}
									>
										{#if opt.state === 1}+{:else if opt.state === 2}-{:else}&nbsp;{/if}
									</button>
									{opt.name}
								</label>
							{:else}
								<label class="flex items-center gap-1 text-xs">
									<input
										type="checkbox"
										checked={!!opt.state}
										onchange={(e) => {
											const target = e.target as HTMLInputElement;
											const states = (filter.state ?? []) as FilterOption[];
											const newStates = [...states];
											newStates[j] = { ...opt, state: target.checked };
											filters[i] = { ...filter, state: newStates };
										}}
									/>
									{opt.name}
								</label>
							{/if}
						{/each}
					</div>
				</details>
			{/if}
		{/each}
		<div class="filter-actions">
			<button class="btn btn-sm preset-filled-primary-500" onclick={() => doSearch(1)}>Apply</button>
			<button class="btn btn-sm preset-tonal-surface" onclick={resetFilters}>Reset</button>
		</div>
	</div>
{/if}

{#if loading && works.length === 0}
	<LoadingSpinner />
{:else if works.length === 0}
	<p class="text-surface-500 mt-4">No works found.</p>
{:else}
	<WorkGrid>
		{#each works as item}
			<WorkCard
				title={item.title}
				coverUrl={item.coverUrl}
				sourceId={item.sourceId}
				workId={item.id}
				href="/work/{item.sourceId}/{encodeURIComponent(item.id)}?title={encodeURIComponent(item.title)}"
				nsfw={item.nsfw}
			/>
		{/each}
	</WorkGrid>

	{#if hasNextPage}
		<div class="text-center my-6">
			<button class="btn preset-tonal-primary" onclick={loadMore} disabled={loading}>
				{loading ? 'Loading...' : 'Load More'}
			</button>
		</div>
	{/if}
{/if}

<style>
	.source-header { margin-bottom: 16px; }

	.search-box {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}

	.search-box .input { width: 200px; }

	.bulk-add-wrapper {
		position: relative;
	}

	.library-picker {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		background: color-mix(in oklch, var(--layer-raised) 95%, transparent);
		border: 1px solid var(--layer-border);
		border-radius: 6px;
		padding: 4px;
		z-index: 10;
		min-width: 160px;
		box-shadow: var(--shadow-overlay);
	}

	.picker-option {
		display: block;
		width: 100%;
		padding: 6px 12px;
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		border-radius: 4px;
		font-size: 0.85rem;
		text-align: left;
	}

	.picker-option:hover {
		background: color-mix(in oklch, var(--layer-border) 40%, transparent);
	}

	.bulk-result {
		background: var(--layer-sunken);
		border-radius: 6px;
		padding: 8px 14px;
		margin-bottom: 16px;
		font-size: 0.85rem;
		color: rgb(var(--color-surface-500));
	}

	.filters-panel {
		background: var(--layer-sunken);
		border-radius: 8px;
		padding: 16px;
		margin-bottom: 16px;
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: flex-start;
	}

	.filter-header {
		width: 100%;
		font-size: 0.85rem;
		color: rgb(var(--color-surface-500));
		font-weight: 600;
		padding-bottom: 4px;
		border-bottom: 1px solid var(--layer-border-subtle);
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.filter-group-collapsible {
		width: 100%;
	}

	.filter-group-collapsible summary {
		cursor: pointer;
		padding: 4px 0;
	}

	.filter-checkboxes {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		padding: 8px 0;
	}

	.filter-checkboxes label {
		font-size: 0.8rem;
	}

	.tri-state {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.8rem;
	}

	.tri-state.included { color: rgb(var(--color-success-500)); }
	.tri-state.excluded { color: rgb(var(--color-error-500)); }

	.tri-btn {
		width: 18px;
		height: 18px;
		border: 1px solid var(--layer-border);
		border-radius: 3px;
		background: var(--layer-sunken);
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0;
	}

	.filter-actions {
		width: 100%;
		display: flex;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--layer-border-subtle);
	}

	@media (max-width: 600px) {
		.search-box { width: 100%; margin-left: 0; }
		.search-box .input { flex: 1; width: auto; }
	}
</style>
