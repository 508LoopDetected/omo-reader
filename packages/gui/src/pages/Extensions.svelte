<script lang="ts">
	import GearToggle from '$lib/components/GearToggle.svelte';
	import ManagementPanel from '$lib/components/ManagementPanel.svelte';

	let managing = $state(false);

	interface AvailableExtension {
		id: string;
		name: string;
		lang: string;
		baseUrl: string;
		iconUrl: string;
		version: string;
		sourceCodeUrl: string;
		isNsfw: boolean;
		hasCloudflare: boolean;
		installed: boolean;
	}

	let extensions: AvailableExtension[] = $state([]);
	let loading = $state(true);
	let installing = $state(new Set<string>());
	let langFilter = $state('all');
	let searchQuery = $state('');

	let langs = $derived([...new Set(extensions.map((e) => e.lang))].sort());
	let filtered = $derived(
		extensions.filter((e) => {
			if (langFilter !== 'all' && e.lang !== langFilter) return false;
			if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
			return true;
		})
	);
	let installedExts = $derived(filtered.filter((e) => e.installed));
	let availableExts = $derived(filtered.filter((e) => !e.installed));

	async function loadExtensions() {
		loading = true;
		extensions = [];
		try {
			const res = await fetch('/api/extensions');
			if (res.ok) {
				extensions = await res.json();
			}
		} catch (err) {
			console.error('Failed to load extensions:', err);
		} finally {
			loading = false;
		}
	}

	async function installExt(ext: AvailableExtension) {
		installing = new Set([...installing, ext.id]);
		try {
			const res = await fetch('/api/extensions/install', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(ext),
			});
			if (res.ok) {
				extensions = extensions.map((e) =>
					e.id === ext.id ? { ...e, installed: true } : e
				);
			}
		} catch (err) {
			console.error('Failed to install:', err);
		} finally {
			const next = new Set(installing);
			next.delete(ext.id);
			installing = next;
		}
	}

	async function uninstallExt(ext: AvailableExtension) {
		installing = new Set([...installing, ext.id]);
		try {
			const res = await fetch('/api/extensions/uninstall', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sourceId: ext.id }),
			});
			if (res.ok) {
				extensions = extensions.map((e) =>
					e.id === ext.id ? { ...e, installed: false } : e
				);
			}
		} catch (err) {
			console.error('Failed to uninstall:', err);
		} finally {
			const next = new Set(installing);
			next.delete(ext.id);
			installing = next;
		}
	}

	$effect(() => {
		loadExtensions();
	});
</script>

<div class="extensions-header">
	<h2 class="title is-4 mb-0">Extensions</h2>
	<GearToggle active={managing} onclick={() => managing = !managing} />
</div>

{#if managing}
	<ManagementPanel sectionIds={['repos']} onchange={loadExtensions} />
{/if}

<div class="filters-row">
	<div class="field">
		<div class="control">
			<input
				class="input is-small"
				type="text"
				placeholder="Search extensions..."
				bind:value={searchQuery}
			/>
		</div>
	</div>
	<div class="field">
		<div class="control">
			<div class="select is-small">
				<select bind:value={langFilter}>
					<option value="all">All languages</option>
					{#each langs as lang}
						<option value={lang}>{lang.toUpperCase()}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>
</div>

{#if loading}
	<p class="has-text-grey">Fetching extension index...</p>
{:else}
	{#if installedExts.length > 0}
		<h3 class="title is-6 mt-4">Installed ({installedExts.length})</h3>
		<div class="ext-list">
			{#each installedExts as ext}
				<div class="ext-item">
					<div class="ext-icon">
						{#if ext.iconUrl}
							<img src={ext.iconUrl} alt="" />
						{:else}
							<div class="ext-icon-placeholder">{ext.name.charAt(0)}</div>
						{/if}
					</div>
					<div class="ext-info">
						<div class="ext-name">{ext.name}</div>
						<div class="ext-meta">{ext.lang.toUpperCase()} &middot; v{ext.version}</div>
					</div>
					<button
						class="button is-small is-danger is-outlined"
						onclick={() => uninstallExt(ext)}
						disabled={installing.has(ext.id)}
					>
						{installing.has(ext.id) ? '...' : 'Uninstall'}
					</button>
				</div>
			{/each}
		</div>
	{/if}

	{#if availableExts.length > 0}
		<h3 class="title is-6 mt-5">Available ({availableExts.length})</h3>
		<div class="ext-list">
			{#each availableExts as ext}
				<div class="ext-item">
					<div class="ext-icon">
						{#if ext.iconUrl}
							<img src={ext.iconUrl} alt="" />
						{:else}
							<div class="ext-icon-placeholder">{ext.name.charAt(0)}</div>
						{/if}
					</div>
					<div class="ext-info">
						<div class="ext-name">
							{ext.name}
							{#if ext.hasCloudflare}
								<span class="tag is-small is-warning" title="Uses Cloudflare — may require browser cookies">CF</span>
							{/if}
						</div>
						<div class="ext-meta">{ext.lang.toUpperCase()} &middot; v{ext.version}</div>
					</div>
					<button
						class="button is-small is-primary is-outlined"
						onclick={() => installExt(ext)}
						disabled={installing.has(ext.id)}
					>
						{installing.has(ext.id) ? '...' : 'Install'}
					</button>
				</div>
			{/each}
		</div>
	{/if}

	{#if filtered.length === 0}
		<p class="has-text-grey mt-4">No extensions found.</p>
	{/if}
{/if}

<style>
	.extensions-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}

	.filters-row {
		display: flex;
		gap: 12px;
		margin-bottom: 16px;
	}

	.filters-row .field:first-child {
		flex: 1;
	}

	.ext-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.ext-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		background: var(--bg-secondary);
		border-radius: 4px;
	}

	.ext-icon {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border-radius: 4px;
		overflow: hidden;
	}

	.ext-icon img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.ext-icon-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-card);
		color: var(--text-secondary);
		font-weight: 600;
	}

	.ext-info {
		flex: 1;
		min-width: 0;
	}

	.ext-name {
		font-size: 0.9rem;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.ext-meta {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}
</style>
