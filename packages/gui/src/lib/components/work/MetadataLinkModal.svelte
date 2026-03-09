<script lang="ts">
	interface SearchResult {
		providerId: string;
		title: string;
		altTitles: string[];
		year: number | null;
		coverUrl: string | null;
		description: string | null;
		status: string | null;
	}

	interface Props {
		sourceId: string;
		workId: string;
		title: string;
		currentProvider: string | null;
		onLink: () => void;
		onClose: () => void;
	}

	let { sourceId, workId, title, currentProvider, onLink, onClose }: Props = $props();

	let provider = $state<'mangaupdates' | 'anilist' | 'comicvine'>(
		(currentProvider as 'mangaupdates' | 'anilist' | 'comicvine') ?? 'mangaupdates'
	);
	let query = $state(title);
	let results = $state<SearchResult[]>([]);
	let searching = $state(false);
	let linking = $state<string | null>(null);
	let searchError = $state<string | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	let providerLabel = $derived(
		provider === 'mangaupdates' ? 'MangaUpdates'
		: provider === 'anilist' ? 'AniList'
		: 'Comic Vine'
	);

	async function doSearch() {
		if (!query.trim()) { results = []; return; }
		searching = true;
		searchError = null;
		try {
			const res = await fetch(`/api/metadata/search?provider=${provider}&query=${encodeURIComponent(query.trim())}`);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				searchError = data.error ?? `Search failed (${res.status})`;
				results = [];
			} else {
				results = await res.json();
			}
		} catch {
			searchError = 'Search failed';
			results = [];
		} finally {
			searching = false;
		}
	}

	function handleInput() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(doSearch, 400);
	}

	async function linkResult(result: SearchResult) {
		linking = result.providerId;
		try {
			const res = await fetch('/api/metadata/link', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sourceId, workId, provider, providerId: result.providerId }),
			});
			if (res.ok) {
				onLink();
			} else {
				const data = await res.json().catch(() => ({}));
				searchError = data.error ?? 'Link failed';
			}
		} catch {
			searchError = 'Link failed';
		} finally {
			linking = null;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	// Initial search
	$effect(() => { doSearch(); });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={onClose} onkeydown={handleKeydown}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-content" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h3 class="modal-title">Link Metadata</h3>
			<button class="modal-close" onclick={onClose} aria-label="Close">
				<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
			</button>
		</div>

		<div class="modal-controls">
			<div class="provider-tabs">
				<button class="tab" class:active={provider === 'mangaupdates'} onclick={() => { provider = 'mangaupdates'; doSearch(); }}>MangaUpdates</button>
				<button class="tab" class:active={provider === 'anilist'} onclick={() => { provider = 'anilist'; doSearch(); }}>AniList</button>
				<button class="tab" class:active={provider === 'comicvine'} onclick={() => { provider = 'comicvine'; doSearch(); }}>Comic Vine</button>
			</div>
			<input
				type="text"
				class="search-input"
				placeholder="Search {providerLabel}..."
				bind:value={query}
				oninput={handleInput}
			/>
		</div>

		<div class="modal-results">
			{#if searching}
				<div class="search-status">Searching...</div>
			{:else if searchError}
				<div class="search-status search-error">{searchError}</div>
			{:else if results.length === 0 && query.trim()}
				<div class="search-status">No results found</div>
			{/if}

			{#each results as result}
				<button
					class="result-card"
					onclick={() => linkResult(result)}
					disabled={linking !== null}
				>
					{#if result.coverUrl}
						<img src={result.coverUrl} alt="" class="result-cover" />
					{:else}
						<div class="result-cover result-cover-empty">?</div>
					{/if}
					<div class="result-info">
						<span class="result-title">{result.title}</span>
						{#if result.year || result.status}
							<span class="result-meta">
								{#if result.year}{result.year}{/if}
								{#if result.year && result.status} &middot; {/if}
								{#if result.status}{result.status}{/if}
							</span>
						{/if}
						{#if result.description}
							<span class="result-desc">{result.description.slice(0, 120)}{result.description.length > 120 ? '...' : ''}</span>
						{/if}
					</div>
					{#if linking === result.providerId}
						<span class="result-linking">Linking...</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal-content {
		width: 90%;
		max-width: 480px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		background: var(--layer-raised);
		border: 1px solid var(--layer-border);
		border-radius: 12px;
		box-shadow: var(--shadow-overlay);
		animation: slideUp 0.2s ease-out;
	}

	@keyframes slideUp {
		from { transform: translateY(12px); opacity: 0; }
		to { transform: translateY(0); opacity: 1; }
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px 0;
	}

	.modal-title {
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
	}

	.modal-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 5px;
		background: none;
		color: inherit;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.modal-close:hover {
		background: color-mix(in oklch, var(--layer-border) 40%, transparent);
	}

	.modal-controls {
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.provider-tabs {
		display: flex;
		gap: 4px;
	}

	.tab {
		flex: 1;
		padding: 6px 12px;
		border: 1px solid var(--layer-border);
		border-radius: 5px;
		background: none;
		color: inherit;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.tab:hover {
		background: color-mix(in oklch, var(--layer-border) 30%, transparent);
	}

	.tab.active {
		background: var(--color-primary-500);
		border-color: var(--color-primary-500);
		color: #fff;
	}

	.search-input {
		width: 100%;
		padding: 8px 12px;
		border: 1px solid var(--layer-border);
		border-radius: 6px;
		background: var(--layer-sunken);
		color: inherit;
		font-size: 0.85rem;
		outline: none;
		transition: border-color var(--transition-fast);
	}

	.search-input:focus {
		border-color: var(--color-primary-500);
	}

	.modal-results {
		flex: 1;
		overflow-y: auto;
		padding: 0 16px 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.search-status {
		text-align: center;
		font-size: 0.8rem;
		color: inherit;
		padding: 16px 0;
	}

	.search-error {
		color: var(--color-error-500);
	}

	.result-card {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 8px 10px;
		border: 1px solid color-mix(in oklch, var(--layer-border) 40%, transparent);
		border-radius: 8px;
		background: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
		transition: all var(--transition-fast);
	}

	.result-card:hover:not(:disabled) {
		background: color-mix(in oklch, var(--layer-border) 25%, transparent);
		border-color: var(--color-primary-500);
	}

	.result-card:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.result-cover {
		width: 48px;
		height: 68px;
		object-fit: cover;
		border-radius: 4px;
		flex-shrink: 0;
		background: var(--layer-sunken);
	}

	.result-cover-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.2rem;
		color: inherit;
		opacity: 0.3;
	}

	.result-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.result-title {
		font-size: 0.85rem;
		font-weight: 600;
		line-height: 1.3;
	}

	.result-meta {
		font-size: 0.7rem;
		color: inherit;
		opacity: 0.7;
	}

	.result-desc {
		font-size: 0.7rem;
		color: inherit;
		opacity: 0.5;
		line-height: 1.4;
		margin-top: 2px;
	}

	.result-linking {
		font-size: 0.7rem;
		color: var(--color-primary-500);
		flex-shrink: 0;
		align-self: center;
	}
</style>
