<script lang="ts">
	import type { Source } from '@omo/core';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import InlineCreateForm from '$lib/components/InlineCreateForm.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let sources: Source[] = $state([]);
	let loading = $state(true);

	// Existing paths and SMB shares from management
	let paths: { id: string; path: string }[] = $state([]);
	let smbShares: { id: string; host: string; share: string; path?: string; domain?: string; username?: string }[] = $state([]);

	let pathForm: InlineCreateForm;
	let smbForm: InlineCreateForm;

	// SMB test state
	let smbTesting = $state<string | null>(null);
	let smbTestResult = $state<{ ok: boolean; msg: string } | null>(null);

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

	async function addSmb(values: Record<string, string>) {
		try {
			const res = await fetch('/api/settings/smb', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(values),
			});
			if (res.ok) {
				smbTestResult = null;
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

	async function testSmb(id?: string, formData?: Record<string, string>) {
		smbTesting = id ?? 'new';
		smbTestResult = null;
		try {
			const body = id ? { id } : {
				host: formData?.host?.trim() ?? '',
				share: formData?.share?.trim() ?? '',
				domain: formData?.domain?.trim() ?? '',
				username: formData?.username?.trim() ?? '',
				password: formData?.password?.trim() ?? '',
			};
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
		<button class="btn btn-sm preset-tonal-secondary" onclick={() => smbForm.toggle()}>Add SMB Share</button>
	{/snippet}
</PageHeader>

<InlineCreateForm
	bind:this={pathForm}
	fields={[{ key: 'path', label: 'Directory Path', placeholder: '/path/to/manga', required: true }]}
	submitLabel="Add Path"
	onsubmit={addPath}
/>

<InlineCreateForm
	bind:this={smbForm}
	fields={[
		{ key: 'label', label: 'Label', placeholder: 'My NAS', required: true },
		{ key: 'host', label: 'Host', placeholder: '192.168.1.100', required: true },
		{ key: 'share', label: 'Share', placeholder: 'manga', required: true },
		{ key: 'path', label: 'Path', placeholder: 'subfolder (optional)' },
		{ key: 'domain', label: 'Domain', placeholder: 'WORKGROUP' },
		{ key: 'username', label: 'Username', required: true },
		{ key: 'password', label: 'Password', type: 'password', required: true },
	]}
	submitLabel="Add SMB Share"
	onsubmit={addSmb}
>
	{#snippet extraActions(formData)}
		<button
			class="btn preset-tonal-secondary"
			type="button"
			disabled={!(formData.host?.trim()) || !(formData.share?.trim()) || !(formData.username?.trim()) || !(formData.password?.trim()) || smbTesting === 'new'}
			onclick={() => testSmb(undefined, formData)}
		>{smbTesting === 'new' ? 'Testing...' : 'Test Connection'}</button>
	{/snippet}
</InlineCreateForm>

{#if smbTestResult}
	<p class="mb-4" class:text-success-500={smbTestResult.ok} class:text-error-500={!smbTestResult.ok}>
		{smbTestResult.msg}
	</p>
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
					<code class="text-sm font-mono truncate">//{item.host}/{item.share}{item.path ? '/' + item.path : ''}</code>
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
		border-radius: 8px;
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
		color: rgb(var(--color-primary-500));
	}

	.source-icon img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		border-radius: 4px;
	}
</style>
