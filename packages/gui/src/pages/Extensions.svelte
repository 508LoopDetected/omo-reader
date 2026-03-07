<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import InlineCreateForm from '$lib/components/InlineCreateForm.svelte';

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

	interface NativeSource {
		id: string;
		name: string;
		enabled: boolean;
		iconUrl?: string;
	}

	let extensions: AvailableExtension[] = $state([]);
	let nativeSources: NativeSource[] = $state([]);
	let repos: { id: string; url: string }[] = $state([]);
	let loading = $state(true);
	let installing = $state(new Set<string>());
	let langFilter = $state('all');
	let searchQuery = $state('');

	let repoForm: InlineCreateForm;

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

	async function loadRepos() {
		try {
			const res = await fetch('/api/manifest');
			if (res.ok) {
				const manifest = await res.json();
				const repoSection = manifest.management.find((s: { id: string }) => s.id === 'repos');
				repos = repoSection?.items ?? [];
			}
		} catch { /* ignore */ }
	}

	async function loadNativeSources() {
		try {
			const res = await fetch('/api/sources/native');
			if (res.ok) {
				nativeSources = await res.json();
			}
		} catch { /* ignore */ }
	}

	async function addRepo(values: Record<string, string>) {
		try {
			const res = await fetch('/api/settings/repos', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(values),
			});
			if (res.ok) {
				await loadRepos();
				await loadExtensions();
			}
		} catch (err) {
			console.error('Failed to add repo:', err);
		}
	}

	async function removeRepo(id: string) {
		try {
			const res = await fetch(`/api/settings/repos?id=${id}`, { method: 'DELETE' });
			if (res.ok) {
				await loadRepos();
				await loadExtensions();
			}
		} catch (err) {
			console.error('Failed to remove repo:', err);
		}
	}

	async function toggleNativeSource(source: NativeSource) {
		const newEnabled = !source.enabled;
		nativeSources = nativeSources.map(s =>
			s.id === source.id ? { ...s, enabled: newEnabled } : s
		);
		try {
			await fetch('/api/sources/native', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: source.id, enabled: newEnabled }),
			});
		} catch (err) {
			console.error('Failed to toggle native source:', err);
			nativeSources = nativeSources.map(s =>
				s.id === source.id ? { ...s, enabled: !newEnabled } : s
			);
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
		loadRepos();
		loadNativeSources();
	});
</script>

<PageHeader title="Extensions">
	{#snippet actions()}
		<button class="btn btn-sm preset-filled-primary-500" onclick={() => repoForm.toggle()}>Add Repo</button>
	{/snippet}
</PageHeader>

<InlineCreateForm
	bind:this={repoForm}
	fields={[{ key: 'url', label: 'Repository URL', placeholder: 'https://github.com/user/repo', required: true }]}
	submitLabel="Add Repo"
	onsubmit={addRepo}
/>

<!-- Repos list -->
{#if repos.length > 0}
	<div class="flex flex-col gap-1 mb-4">
		{#each repos as repo}
			<div class="flex items-center justify-between gap-3 px-3 py-2 bg-surface-100-900 rounded">
				<code class="text-sm font-mono bg-surface-200-800 px-1.5 py-0.5 rounded truncate">{repo.url}</code>
				<button class="btn btn-sm preset-tonal-error" onclick={() => removeRepo(repo.id)}>Remove</button>
			</div>
		{/each}
	</div>
{:else}
	<p class="text-surface-500 mb-4 text-xs">No custom repos. Using default: <code>kodjodevf/mangayomi-extensions</code></p>
{/if}

<!-- Native sources / integrations -->
{#if nativeSources.length > 0}
	<div class="mb-6">
		<h3 class="h6">Integrations</h3>
		<div class="flex flex-wrap gap-2">
			{#each nativeSources as source}
				<div
					class="flex items-center gap-2.5 px-3.5 py-2.5 bg-surface-100-900 rounded-md opacity-60 transition-opacity"
					class:!opacity-100={source.enabled}
				>
					<div class="native-icon">
						{#if source.iconUrl}
							<img src={source.iconUrl} alt="" />
						{:else}
							<div class="native-icon-placeholder">{source.name.charAt(0)}</div>
						{/if}
					</div>
					<span class="native-name">{source.name}</span>
					<button
						class="btn btn-sm {source.enabled ? 'preset-filled-primary-500' : 'preset-tonal-primary'}"
						onclick={() => toggleNativeSource(source)}
					>
						{source.enabled ? 'On' : 'Off'}
					</button>
				</div>
			{/each}
		</div>
	</div>
{/if}

<div class="flex gap-3 mb-4">
	<input
		class="input text-sm px-2 py-1 rounded flex-1"
		type="text"
		placeholder="Search extensions..."
		bind:value={searchQuery}
	/>
	<select class="select text-sm px-2 py-1 rounded" bind:value={langFilter}>
		<option value="all">All languages</option>
		{#each langs as lang}
			<option value={lang}>{lang.toUpperCase()}</option>
		{/each}
	</select>
</div>

{#if loading}
	<p class="text-surface-500">Fetching extension index...</p>
{:else}
	{#if installedExts.length > 0}
		<h3 class="h6 mt-4">Installed ({installedExts.length})</h3>
		<div class="flex flex-col gap-0.5">
			{#each installedExts as ext}
				<div class="flex items-center gap-3 px-4 py-2.5 bg-surface-100-900 rounded">
					<div class="ext-icon">
						{#if ext.iconUrl}
							<img src={ext.iconUrl} alt="" />
						{:else}
							<div class="ext-icon-placeholder">{ext.name.charAt(0)}</div>
						{/if}
					</div>
					<div class="flex-1 min-w-0">
						<div class="text-sm flex items-center gap-1.5">{ext.name}</div>
						<div class="text-xs text-surface-500">{ext.lang.toUpperCase()} &middot; v{ext.version}</div>
					</div>
					<button
						class="btn btn-sm preset-tonal-error"
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
		<h3 class="h6 mt-6">Available ({availableExts.length})</h3>
		<div class="flex flex-col gap-0.5">
			{#each availableExts as ext}
				<div class="flex items-center gap-3 px-4 py-2.5 bg-surface-100-900 rounded">
					<div class="ext-icon">
						{#if ext.iconUrl}
							<img src={ext.iconUrl} alt="" />
						{:else}
							<div class="ext-icon-placeholder">{ext.name.charAt(0)}</div>
						{/if}
					</div>
					<div class="flex-1 min-w-0">
						<div class="text-sm flex items-center gap-1.5">
							{ext.name}
							{#if ext.hasCloudflare}
								<span class="badge preset-tonal-warning text-xs" title="Uses Cloudflare — may require browser cookies">CF</span>
							{/if}
						</div>
						<div class="text-xs text-surface-500">{ext.lang.toUpperCase()} &middot; v{ext.version}</div>
					</div>
					<button
						class="btn btn-sm preset-filled-primary-500"
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
		<p class="text-surface-500 mt-4">No extensions found.</p>
	{/if}
{/if}

<style>
	.native-icon {
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		border-radius: 4px;
		overflow: hidden;
	}

	.native-icon img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.native-icon-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--layer-sunken);
		color: rgb(var(--color-surface-500));
		font-weight: 600;
		font-size: 0.85rem;
	}

	.native-name {
		font-size: 0.9rem;
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
		background: var(--layer-sunken);
		color: rgb(var(--color-surface-500));
		font-weight: 600;
	}
</style>
