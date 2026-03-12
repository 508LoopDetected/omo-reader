<script lang="ts">
	import type { Source } from '@omo/core';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import InlineCreateForm from '$lib/components/InlineCreateForm.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let sources: Source[] = $state([]);
	let loading = $state(true);

	// Existing paths and SMB shares from management
	let paths: { id: string; path: string }[] = $state([]);
	let smbShares: { id: string; host: string; share: string; path?: string; domain?: string; username?: string; label?: string }[] = $state([]);

	let pathForm: InlineCreateForm;

	// SMB form state
	let smbFormVisible = $state(false);
	let smbLabel = $state('');
	let smbHost = $state('');
	let smbDomain = $state('');
	let smbUsername = $state('');
	let smbPassword = $state('');
	let smbSelectedPath = $state(''); // combined "share/path"

	// SMB test state
	let smbTesting = $state<string | null>(null);
	let smbTestResult = $state<{ ok: boolean; msg: string } | null>(null);

	// SMB browser state
	let browseItems = $state<{ name: string; comment?: string }[]>([]);
	let browseLoading = $state(false);
	let browseError = $state('');
	let browsePath = $state<string[]>([]); // [share, dir, dir, ...]
	let browseOpen = $state(false);

	function smbCredsReady(): boolean {
		return !!(smbHost.trim() && smbUsername.trim() && smbPassword.trim());
	}

	function smbFormValid(): boolean {
		return !!(smbLabel.trim() && smbHost.trim() && smbSelectedPath.trim() && smbUsername.trim() && smbPassword.trim());
	}

	function resetSmbForm() {
		smbLabel = '';
		smbHost = '';
		smbDomain = '';
		smbUsername = '';
		smbPassword = '';
		smbSelectedPath = '';
		browseItems = [];
		browsePath = [];
		browseOpen = false;
		browseError = '';
		smbTestResult = null;
	}

	function toggleSmbForm() {
		smbFormVisible = !smbFormVisible;
		if (smbFormVisible) resetSmbForm();
	}

	/** Split a combined share path like "manga/subfolder" into { share, path }. */
	function splitSharePath(combined: string): { share: string; path: string } {
		const trimmed = combined.replace(/^[\\/]+/, '').trim();
		const idx = trimmed.indexOf('/');
		if (idx < 0) return { share: trimmed, path: '' };
		return { share: trimmed.slice(0, idx), path: trimmed.slice(idx + 1) };
	}

	// ── Browse logic ──

	async function browseSmb(share?: string, path?: string) {
		browseLoading = true;
		browseError = '';
		try {
			const res = await fetch('/api/settings/smb/browse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					host: smbHost.trim(),
					domain: smbDomain.trim(),
					username: smbUsername.trim(),
					password: smbPassword.trim(),
					share,
					path,
				}),
			});
			const data = await res.json();
			if (data.type === 'error') {
				browseError = data.error;
				browseItems = [];
			} else {
				browseItems = data.items;
			}
		} catch {
			browseError = 'Request failed';
			browseItems = [];
		} finally {
			browseLoading = false;
		}
	}

	async function openBrowser() {
		browseOpen = true;
		browsePath = [];
		await browseSmb();
	}

	async function browseInto(name: string) {
		if (browsePath.length === 0) {
			// Entering a share
			browsePath = [name];
			await browseSmb(name);
		} else {
			// Entering a subdirectory
			browsePath = [...browsePath, name];
			const share = browsePath[0];
			const subpath = browsePath.slice(1).join('/');
			await browseSmb(share, subpath);
		}
	}

	function browseUp() {
		if (browsePath.length <= 1) {
			// Go back to share list
			browsePath = [];
			browseSmb();
		} else {
			browsePath = browsePath.slice(0, -1);
			const share = browsePath[0];
			const subpath = browsePath.slice(1).join('/');
			browseSmb(share, subpath);
		}
	}

	function selectCurrentPath() {
		smbSelectedPath = browsePath.join('/');
		browseOpen = false;
	}

	// ── Data loading ──

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

	async function loadPaths() {
		try {
			const res = await fetch('/api/manifest');
			if (res.ok) {
				const manifest = await res.json();
				const pathSection = manifest.management.find((s: { id: string }) => s.id === 'paths');
				paths = pathSection?.items ?? [];
				const smbSection = manifest.management.find((s: { id: string }) => s.id === 'smb');
				smbShares = smbSection?.items ?? [];
			}
		} catch { /* ignore */ }
	}

	async function addPath(values: Record<string, string>) {
		try {
			const res = await fetch('/api/settings/paths', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(values),
			});
			if (res.ok) {
				await loadPaths();
				await loadSources();
			}
		} catch (err) {
			console.error('Failed to add path:', err);
		}
	}

	async function removePath(id: string) {
		try {
			const res = await fetch(`/api/settings/paths?id=${id}`, { method: 'DELETE' });
			if (res.ok) {
				const data = await res.json().catch(() => ({}));
				if (data.removedTitles > 0) {
					window.dispatchEvent(new CustomEvent('libraries-changed'));
					window.dispatchEvent(new CustomEvent('collections-changed'));
				}
				await loadPaths();
				await loadSources();
			}
		} catch (err) {
			console.error('Failed to remove path:', err);
		}
	}

	async function addSmb() {
		try {
			const { share, path } = splitSharePath(smbSelectedPath);
			const res = await fetch('/api/settings/smb', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					label: smbLabel.trim(),
					host: smbHost.trim(),
					share,
					path,
					domain: smbDomain.trim(),
					username: smbUsername.trim(),
					password: smbPassword.trim(),
				}),
			});
			if (res.ok) {
				smbTestResult = null;
				smbFormVisible = false;
				await loadPaths();
				await loadSources();
			}
		} catch (err) {
			console.error('Failed to add SMB share:', err);
		}
	}

	async function removeSmb(id: string) {
		try {
			const res = await fetch(`/api/settings/smb?id=${id}`, { method: 'DELETE' });
			if (res.ok) {
				const data = await res.json().catch(() => ({}));
				if (data.removedTitles > 0) {
					window.dispatchEvent(new CustomEvent('libraries-changed'));
					window.dispatchEvent(new CustomEvent('collections-changed'));
				}
				await loadPaths();
				await loadSources();
			}
		} catch (err) {
			console.error('Failed to remove SMB share:', err);
		}
	}

	async function testSmb(id?: string) {
		smbTesting = id ?? 'new';
		smbTestResult = null;
		try {
			let body: Record<string, string>;
			if (id) {
				body = { id };
			} else {
				const { share, path } = splitSharePath(smbSelectedPath);
				body = {
					host: smbHost.trim(),
					share,
					path,
					domain: smbDomain.trim(),
					username: smbUsername.trim(),
					password: smbPassword.trim(),
				};
			}
			const res = await fetch('/api/settings/smb/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (res.ok) {
				const data = await res.json();
				smbTestResult = { ok: data.connected, msg: data.connected ? 'Connected' : (data.error || 'Failed') };
			}
		} catch {
			smbTestResult = { ok: false, msg: 'Request failed' };
		} finally {
			smbTesting = null;
		}
	}

	$effect(() => {
		loadSources();
		loadPaths();
	});
</script>

<PageHeader title="Sources">
	{#snippet actions()}
		<button class="btn btn-sm preset-filled-primary-500" onclick={() => pathForm.toggle()}>Add Local Path</button>
		<button class="btn btn-sm preset-tonal-secondary" onclick={toggleSmbForm}>Add SMB Share</button>
	{/snippet}
</PageHeader>

<InlineCreateForm
	bind:this={pathForm}
	fields={[{ key: 'path', label: 'Directory Path', placeholder: '/path/to/manga', required: true }]}
	submitLabel="Add Path"
	onsubmit={addPath}
/>

<!-- SMB form with inline browser -->
{#if smbFormVisible}
	<form class="card bg-surface-100-900 rounded-lg p-5 mb-5" onsubmit={(e) => { e.preventDefault(); addSmb(); }}>
		<div class="mb-3">
			<label class="text-xs text-surface-500 mb-1 block">Label</label>
			<input class="input text-sm px-3 py-2 rounded" type="text" placeholder="My NAS" bind:value={smbLabel} />
		</div>
		<div class="mb-3">
			<label class="text-xs text-surface-500 mb-1 block">Host</label>
			<input class="input text-sm px-3 py-2 rounded" type="text" placeholder="192.168.1.100" bind:value={smbHost} />
		</div>
		<div class="mb-3">
			<label class="text-xs text-surface-500 mb-1 block">Domain (optional)</label>
			<input class="input text-sm px-3 py-2 rounded" type="text" placeholder="WORKGROUP" bind:value={smbDomain} />
		</div>
		<div class="mb-3">
			<label class="text-xs text-surface-500 mb-1 block">Username</label>
			<input class="input text-sm px-3 py-2 rounded" type="text" bind:value={smbUsername} />
		</div>
		<div class="mb-3">
			<label class="text-xs text-surface-500 mb-1 block">Password</label>
			<input class="input text-sm px-3 py-2 rounded" type="password" bind:value={smbPassword} />
		</div>

		<!-- Path with browse button -->
		<div class="mb-3">
			<label class="text-xs text-surface-500 mb-1 block">Path</label>
			<div class="flex gap-2">
				<input
					class="input text-sm px-3 py-2 rounded flex-1"
					type="text"
					placeholder="share/subfolder"
					bind:value={smbSelectedPath}
				/>
				<button
					class="btn btn-sm preset-tonal-secondary"
					type="button"
					disabled={!smbCredsReady() || browseLoading}
					onclick={openBrowser}
				>{browseLoading && browseOpen ? 'Loading...' : 'Browse'}</button>
			</div>
		</div>

		<!-- Inline browser -->
		{#if browseOpen}
			<div class="smb-browser mb-3">
				<div class="flex items-center gap-2 px-3 py-2 border-b border-surface-300-700">
					{#if browsePath.length > 0}
						<button class="btn btn-sm preset-tonal-surface" type="button" onclick={browseUp}>
							<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
						</button>
					{/if}
					<code class="text-xs text-surface-500 truncate flex-1">
						{browsePath.length === 0 ? 'Shares' : '/' + browsePath.join('/')}
					</code>
					{#if browsePath.length > 0}
						<button
							class="btn btn-sm preset-filled-primary-500"
							type="button"
							onclick={selectCurrentPath}
						>Select</button>
					{/if}
				</div>

				{#if browseError}
					<p class="text-error-500 text-xs px-3 py-2">{browseError}</p>
				{:else if browseLoading}
					<div class="px-3 py-4 text-center text-xs text-surface-500">Loading...</div>
				{:else if browseItems.length === 0}
					<div class="px-3 py-4 text-center text-xs text-surface-500">
						{browsePath.length === 0 ? 'No shares found' : 'Empty directory'}
					</div>
				{:else}
					<div class="smb-browser-list">
						{#each browseItems as item}
							<button
								class="smb-browser-item"
								type="button"
								onclick={() => browseInto(item.name)}
							>
								<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="shrink-0 opacity-50">
									<path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
								</svg>
								<span class="truncate">{item.name}</span>
								{#if item.comment}
									<span class="text-xs text-surface-500 truncate ml-auto">{item.comment}</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if smbTestResult}
			<p class="mb-3 text-sm" class:text-success-500={smbTestResult.ok} class:text-error-500={!smbTestResult.ok}>
				{smbTestResult.msg}
			</p>
		{/if}

		<div class="flex gap-2 mt-3">
			<button class="btn btn-sm preset-filled-primary-500" type="submit" disabled={!smbFormValid()}>Add SMB Share</button>
			<button
				class="btn btn-sm preset-tonal-secondary"
				type="button"
				disabled={!smbFormValid() || smbTesting === 'new'}
				onclick={() => testSmb()}
			>{smbTesting === 'new' ? 'Testing...' : 'Test Connection'}</button>
			<button class="btn btn-sm preset-tonal-surface" type="button" onclick={toggleSmbForm}>Cancel</button>
		</div>
	</form>
{/if}

<!-- Existing paths -->
{#if paths.length > 0}
	<div class="flex flex-col gap-1 mb-4">
		<h4 class="text-xs uppercase tracking-wide text-surface-500 mb-1.5">Local Paths</h4>
		{#each paths as item}
			<div class="flex items-center justify-between gap-3 px-3 py-2 bg-surface-100-900 rounded">
				<code class="text-sm font-mono truncate">{item.path}</code>
				<button class="btn btn-sm preset-tonal-error" onclick={() => removePath(item.id)}>Remove</button>
			</div>
		{/each}
	</div>
{/if}

{#if smbShares.length > 0}
	<div class="flex flex-col gap-1 mb-4">
		<h4 class="text-xs uppercase tracking-wide text-surface-500 mb-1.5">SMB Shares</h4>
		{#each smbShares as item}
			<div class="flex items-center justify-between gap-3 px-3 py-2 bg-surface-100-900 rounded">
				<div class="flex-1 min-w-0">
					<code class="text-sm font-mono truncate">{item.label ?? `//${item.host}/${item.share}${item.path ? '/' + item.path : ''}`}</code>
				</div>
				<div class="flex gap-1.5 shrink-0">
					<button
						class="btn btn-sm preset-tonal-secondary"
						disabled={smbTesting === String(item.id)}
						onclick={() => testSmb(String(item.id))}
					>
						{smbTesting === String(item.id) ? 'Testing...' : 'Test'}
					</button>
					<button class="btn btn-sm preset-tonal-error" onclick={() => removeSmb(item.id)}>Remove</button>
				</div>
			</div>
		{/each}
	</div>
{/if}

{#if loading}
	<LoadingSpinner />
{:else}
	<div class="flex flex-col gap-0.5">
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
					<div class="font-medium">{source.name}</div>
					<div class="text-xs text-surface-500">{source.type} &middot; {source.lang}</div>
				</div>
			</a>
		{/each}
	</div>

	<div class="mt-6">
		<p class="text-surface-500 text-xs">Extension sources will appear here once configured. Add extension repos from the <a href="/extensions">Extensions</a> page.</p>
	</div>
{/if}

<style>
	.source-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: var(--layer-raised);
		border: 1px solid color-mix(in oklch, var(--layer-border) 30%, transparent);
		border-radius: 5px;
		text-decoration: none !important;
		color: inherit !important;
		transition: all var(--transition-fast);
	}

	.source-item:hover {
		background: var(--layer-sunken);
		border-color: var(--layer-border);
		box-shadow: var(--shadow-raised);
	}

	.source-icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-primary-500);
	}

	.source-icon img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		border-radius: 3px;
	}

	.smb-browser {
		border: 1px solid color-mix(in oklch, var(--layer-border) 50%, transparent);
		border-radius: 5px;
		overflow: hidden;
		background: var(--layer-sunken);
	}

	.smb-browser-list {
		max-height: 240px;
		overflow-y: auto;
	}

	.smb-browser-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 12px;
		text-align: left;
		font-size: 0.8125rem;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		transition: background 0.1s;
	}

	.smb-browser-item:hover {
		background: color-mix(in oklch, var(--layer-border) 30%, transparent);
	}
</style>
