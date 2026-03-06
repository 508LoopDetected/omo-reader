<script lang="ts">
	import WorkCard from '$lib/components/library/WorkCard.svelte';
	import type { WorkEntry, Source } from '@omo/core';

	interface SourceResult {
		source: Source;
		items: WorkEntry[];
		hasNextPage: boolean;
	}

	let query = $state('');
	let results = $state<SourceResult[]>([]);
	let loading = $state(false);
	let searched = $state(false);

	async function doSearch() {
		const q = query.trim();
		if (!q) return;

		loading = true;
		searched = true;
		results = [];

		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&page=1`);
			if (res.ok) {
				const data = await res.json();
				results = data.results;
			}
		} catch (err) {
			console.error('Search failed:', err);
		} finally {
			loading = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') doSearch();
	}

	async function loadMore(sourceResult: SourceResult, index: number) {
		const nextPage = 2; // simple: just load page 2
		try {
			const res = await fetch(
				`/api/sources/${sourceResult.source.id}/search?q=${encodeURIComponent(query)}&page=${nextPage}`
			);
			if (res.ok) {
				const data = await res.json();
				results[index] = {
					...sourceResult,
					items: [...sourceResult.items, ...data.items],
					hasNextPage: data.hasNextPage,
				};
			}
		} catch (err) {
			console.error('Load more failed:', err);
		}
	}
</script>

<div class="search-page">
	<h2 class="title is-4">Search All Sources</h2>

	<div class="search-bar">
		<input
			type="text"
			bind:value={query}
			onkeydown={onKeydown}
			placeholder="Search across all sources..."
			class="search-input"
		/>
		<button class="search-btn" onclick={doSearch} disabled={loading}>
			{#if loading}
				<div class="spinner-small"></div>
			{:else}
				<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
			{/if}
		</button>
	</div>

	{#if loading}
		<div class="has-text-centered py-6">
			<div class="loader-inline"></div>
			<p class="loading-text">Searching all sources...</p>
		</div>
	{:else if searched && results.length === 0}
		<p class="no-results">No results found across any source.</p>
	{:else}
		{#each results as sourceResult, i}
			{#if sourceResult.items.length > 0}
				<div class="source-group">
					<div class="source-header">
						{#if sourceResult.source.iconUrl}
							<img src={sourceResult.source.iconUrl} alt="" class="source-icon" />
						{/if}
						<h3 class="source-name">{sourceResult.source.name}</h3>
						<span class="result-count">{sourceResult.items.length} result{sourceResult.items.length !== 1 ? 's' : ''}</span>
					</div>
					<div class="work-grid">
						{#each sourceResult.items as work}
							<WorkCard
								title={work.title}
								coverUrl={work.coverUrl}
								sourceId={sourceResult.source.id}
								workId={work.id}
								href="/work/{sourceResult.source.id}/{encodeURIComponent(work.id)}?title={encodeURIComponent(work.title)}"
								nsfw={work.nsfw}
							/>
						{/each}
					</div>
					{#if sourceResult.hasNextPage}
						<button class="load-more-btn" onclick={() => loadMore(sourceResult, i)}>
							Load more from {sourceResult.source.name}
						</button>
					{/if}
				</div>
			{/if}
		{/each}
	{/if}
</div>

<style>
	.search-page {
		max-width: 1200px;
	}

	.search-bar {
		display: flex;
		gap: 8px;
		margin-bottom: 24px;
	}

	.search-input {
		flex: 1;
		padding: 10px 14px;
		border: 1px solid #333;
		border-radius: 6px;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-size: 0.95rem;
	}

	.search-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.search-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 10px 16px;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.search-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.source-group {
		margin-bottom: 32px;
	}

	.source-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid #1e1e2e;
	}

	.source-icon {
		width: 20px;
		height: 20px;
		border-radius: 4px;
	}

	.source-name {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.result-count {
		font-size: 0.8rem;
		color: var(--text-secondary);
		margin-left: auto;
	}

	.work-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 16px;
	}

	.load-more-btn {
		display: block;
		margin: 12px auto 0;
		padding: 8px 20px;
		background: none;
		border: 1px solid #333;
		color: var(--text-secondary);
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.85rem;
	}

	.load-more-btn:hover {
		border-color: #555;
		color: var(--text-primary);
	}

	.no-results {
		color: var(--text-secondary);
		text-align: center;
		padding: 40px 0;
	}

	.loading-text {
		color: var(--text-secondary);
		font-size: 0.85rem;
		margin-top: 12px;
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

	.spinner-small {
		width: 18px;
		height: 18px;
		border: 2px solid rgba(255,255,255,0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	@media (max-width: 600px) {
		.work-grid {
			grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
			gap: 10px;
		}
	}
</style>
