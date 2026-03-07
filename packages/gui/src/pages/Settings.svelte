<script lang="ts">
	import { nsfwMode } from '$lib/stores/nsfw.js';
	import type { NsfwMode } from '$lib/stores/nsfw.js';
	import type { SettingDef, ManagementSection, ManagementActionDef } from '@omo/core';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import DangerAction from '$lib/components/DangerAction.svelte';

	let settingCategories = $state<{ id: string; label: string; settings: SettingDef[] }[]>([]);
	let appSettings: Record<string, string> = $state({});
	let loading = $state(true);

	// Client-only preferences
	let preferOngoing = $state(typeof window !== 'undefined' && localStorage.getItem('preferOngoingSection') === 'true');
	let defaultChapterSort = $state<'asc' | 'desc'>(
		typeof window !== 'undefined' ? (localStorage.getItem('defaultChapterSort') as 'asc' | 'desc' | null) ?? 'asc' : 'asc'
	);

	function togglePreferOngoing() {
		preferOngoing = !preferOngoing;
		localStorage.setItem('preferOngoingSection', String(preferOngoing));
	}

	function setDefaultSort(value: string) {
		defaultChapterSort = value as 'asc' | 'desc';
		localStorage.setItem('defaultChapterSort', value);
	}

	// Cache section state
	let cacheSize = $state(0);
	let cacheCount = $state(0);
	let clearingCache = $state(false);

	// Danger zone
	let dangerSection = $state<ManagementSection | null>(null);

	async function loadAll() {
		try {
			const [settingsRes, manifestRes] = await Promise.all([
				fetch('/api/settings/app'),
				fetch('/api/manifest'),
			]);

			if (settingsRes.ok) appSettings = await settingsRes.json();
			if (manifestRes.ok) {
				const manifest = await manifestRes.json();
				settingCategories = manifest.settings.categories.filter(
					(c: { settings: SettingDef[] }) => c.settings.some((s: SettingDef) => !s.platforms || s.platforms.includes('gui'))
				);
				for (const [key, value] of Object.entries(manifest.settings.values)) {
					if (!(key in appSettings)) appSettings[key] = value as string;
				}

				// Extract cache + danger sections
				const mgmt = manifest.management as ManagementSection[];
				const cacheSec = mgmt.find(s => s.id === 'cache');
				if (cacheSec?.stats) {
					cacheSize = cacheSec.stats.totalSize as number;
					cacheCount = cacheSec.stats.totalCount as number;
				}
				dangerSection = mgmt.find(s => s.id === 'danger') ?? null;
			}
		} catch (err) {
			console.error('Failed to load settings:', err);
		} finally {
			loading = false;
		}
	}

	async function saveSetting(key: string, value: string) {
		appSettings = { ...appSettings, [key]: value };
		if (key === 'browse.nsfwMode') {
			nsfwMode.set(value as NsfwMode);
		}
		if (key === 'ui.colorScheme') {
			document.documentElement.setAttribute('data-theme', value);
		}
		if (key === 'ui.theme') {
			document.documentElement.classList.toggle('dark', value === 'dark');
			document.documentElement.classList.toggle('light', value === 'light');
		}
		try {
			await fetch('/api/settings/app', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [key]: value }),
			});
		} catch (err) {
			console.error('Failed to save setting:', err);
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	async function clearCache() {
		clearingCache = true;
		try {
			await fetch('/api/cache/thumbnails', { method: 'DELETE' });
			cacheSize = 0;
			cacheCount = 0;
		} catch (err) {
			console.error('Failed to clear cache:', err);
		} finally {
			clearingCache = false;
		}
	}

	async function doReset() {
		if (!dangerSection?.actions) return;
		const resetAction = dangerSection.actions.find((a: ManagementActionDef) => a.key === 'reset');
		if (!resetAction) return;
		await fetch(resetAction.endpoint, { method: resetAction.method ?? 'POST' });
		window.location.href = '/';
	}

	$effect(() => {
		loadAll();
	});
</script>

<h2 class="h4">Settings</h2>

{#if loading}
	<LoadingSpinner />
{:else}
	{#each settingCategories as category}
		{@const guiSettings = category.settings.filter(s => !s.platforms || s.platforms.includes('gui'))}
		{#if guiSettings.length > 0}
			<div class="card bg-surface-100-900 rounded-lg p-6 mb-6">
				<h3 class="h5">{category.label}</h3>

				<div class="settings-grid">
					{#each guiSettings as setting}
						<div class="setting-item">
							<label class="text-sm">{setting.label}</label>
							{#if setting.type === 'select' && setting.options}
								<select
									class="select text-sm px-2 py-1 rounded"
									value={appSettings[setting.key] ?? setting.defaultValue}
									onchange={(e) => saveSetting(setting.key, (e.target as HTMLSelectElement).value)}
								>
									{#each setting.options as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							{:else if setting.type === 'toggle'}
								<button
									class="btn btn-sm {appSettings[setting.key] === 'true' ? 'preset-filled-primary-500' : 'preset-tonal-primary'}"
									onclick={() => saveSetting(setting.key, appSettings[setting.key] === 'true' ? 'false' : 'true')}
								>
									{appSettings[setting.key] === 'true' ? 'On' : 'Off'}
								</button>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/each}

	<!-- Work Detail -->
	<div class="card bg-surface-100-900 rounded-lg p-6 mb-6">
		<h3 class="h5">Work Detail</h3>
		<div class="settings-grid">
			<div class="setting-item">
				<label class="text-sm">Default to Ongoing section</label>
				<button
					class="btn btn-sm {preferOngoing ? 'preset-filled-primary-500' : 'preset-tonal-primary'}"
					onclick={togglePreferOngoing}
				>
					{preferOngoing ? 'On' : 'Off'}
				</button>
			</div>
			<div class="setting-item">
				<label class="text-sm">Default chapter sort</label>
				<select
					class="select text-sm px-2 py-1 rounded"
					value={defaultChapterSort}
					onchange={(e) => setDefaultSort((e.target as HTMLSelectElement).value)}
				>
					<option value="asc">Oldest first</option>
					<option value="desc">Newest first</option>
				</select>
			</div>
		</div>
	</div>

	<!-- Cache -->
	<div class="card bg-surface-100-900 rounded-lg p-6 mb-6">
		<h3 class="h5">Cache</h3>
		<div class="settings-grid mb-4">
			<div class="setting-item">
				<span class="text-sm">Cache size</span>
				<span>{formatBytes(cacheSize)} ({cacheCount} thumbnails)</span>
			</div>
		</div>
		<button
			class="btn btn-sm preset-tonal-warning"
			disabled={clearingCache}
			onclick={clearCache}
		>
			{clearingCache ? 'Clearing...' : 'Clear Cache'}
		</button>
	</div>

	<!-- Danger Zone -->
	{#if dangerSection}
		<div class="card bg-surface-100-900 rounded-lg p-6 mb-6 border border-error-500/30">
			<h3 class="h5 text-error-500">{dangerSection.label}</h3>
			{#if dangerSection.description}
				<p class="text-surface-500 mb-4">{dangerSection.description}</p>
			{/if}
			<DangerAction
				label="Reset All Data"
				confirmMessage="This will delete ALL data including your library, settings, and progress. This cannot be undone."
				confirmLabel="Yes, delete everything"
				onconfirm={doReset}
			/>
		</div>
	{/if}
{/if}

<style>
	.settings-grid {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.setting-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	@media (max-width: 600px) {
		.setting-item { flex-direction: column; align-items: flex-start; gap: 6px; }
	}
</style>
