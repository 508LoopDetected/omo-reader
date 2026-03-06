<script lang="ts">
	import type { Source } from '@omo/core';
	import GearToggle from '$lib/components/GearToggle.svelte';
	import ManagementPanel from '$lib/components/ManagementPanel.svelte';

	let sources: Source[] = $state([]);
	let loading = $state(true);
	let managing = $state(false);

	async function loadSources() {
		try {
			const res = await fetch('/api/sources');
			if (res.ok) {
				sources = await res.json();
			}
		} catch (err) {
			console.error('Failed to load sources:', err);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		loadSources();
	});
</script>

<div class="sources-header">
	<h2 class="title is-4 mb-0">Sources</h2>
	<GearToggle active={managing} onclick={() => managing = !managing} />
</div>

{#if managing}
	<ManagementPanel sectionIds={['paths', 'smb']} onchange={loadSources} />
{/if}

{#if loading}
	<p class="has-text-grey">Loading...</p>
{:else}
	<div class="source-list">
		{#each sources as source}
			<a href="/sources/{source.id}" class="source-item">
				<div class="source-icon">
					{#if source.iconUrl}
						<img src={source.iconUrl} alt="" />
					{:else}
						<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 6H12L10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>
					{/if}
				</div>
				<div>
					<div class="source-name">{source.name}</div>
					<div class="source-meta">{source.type} &middot; {source.lang}</div>
				</div>
			</a>
		{/each}
	</div>

	<div class="mt-5">
		<p class="has-text-grey is-size-7">Extension sources will appear here once configured. Add extension repos from the <a href="/extensions">Extensions</a> page.</p>
	</div>
{/if}

<style>
	.sources-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}

	.source-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.source-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: var(--bg-secondary);
		border-radius: 6px;
		text-decoration: none !important;
		color: var(--text-primary) !important;
		transition: background 0.15s;
	}

	.source-item:hover {
		background: var(--bg-card);
	}

	.source-icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent);
	}

	.source-icon img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		border-radius: 4px;
	}

	.source-name {
		font-weight: 500;
	}

	.source-meta {
		font-size: 0.8rem;
		color: var(--text-secondary);
	}
</style>
