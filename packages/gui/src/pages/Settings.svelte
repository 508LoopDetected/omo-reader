<script lang="ts">
	import { nsfwMode } from '$lib/stores/nsfw.js';
	import type { NsfwMode } from '$lib/stores/nsfw.js';
	import type { SettingDef } from '@omo/core';
	import ManagementPanel from '$lib/components/ManagementPanel.svelte';

	let settingCategories = $state<{ id: string; label: string; settings: SettingDef[] }[]>([]);
	let appSettings: Record<string, string> = $state({});
	let loading = $state(true);

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

	$effect(() => {
		loadAll();
	});
</script>

<h2 class="title is-4">Settings</h2>

{#if loading}
	<div class="has-text-centered py-6">
		<div class="loader-inline"></div>
	</div>
{:else}
	{#each settingCategories as category}
		{@const guiSettings = category.settings.filter(s => !s.platforms || s.platforms.includes('gui'))}
		{#if guiSettings.length > 0}
			<div class="settings-section mb-5">
				<h3 class="title is-5">{category.label}</h3>

				<div class="settings-grid">
					{#each guiSettings as setting}
						<div class="setting-item">
							<label class="setting-label">{setting.label}</label>
							{#if setting.type === 'select' && setting.options}
								<div class="select is-small">
									<select
										value={appSettings[setting.key] ?? setting.defaultValue}
										onchange={(e) => saveSetting(setting.key, (e.target as HTMLSelectElement).value)}
									>
										{#each setting.options as opt}
											<option value={opt.value}>{opt.label}</option>
										{/each}
									</select>
								</div>
							{:else if setting.type === 'toggle'}
								<button
									class="button is-small"
									class:is-primary={appSettings[setting.key] === 'true'}
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

	<ManagementPanel sectionIds={['cache', 'danger']} />
{/if}

<style>
	.settings-section {
		background: var(--bg-secondary);
		border-radius: 8px;
		padding: 24px;
	}

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

	.setting-label {
		font-size: 0.9rem;
		color: var(--text-primary);
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
		.setting-item { flex-direction: column; align-items: flex-start; gap: 6px; }
	}
</style>
