<script lang="ts">
	import { nsfwMode as nsfwStore } from '$lib/stores/nsfw.js';
	import type { NsfwMode } from '$lib/stores/nsfw.js';
	import type { SettingDef, ManagementSection, ManagementActionDef } from '@omo/core';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import DangerAction from '$lib/components/DangerAction.svelte';

	// NSFW mode
	let nsfwMode = $state<NsfwMode>('sfw');

	// Theme mode
	type ThemeMode = 'dark' | 'light' | 'system';
	let themeMode = $state<ThemeMode>('dark');

	let settingCategories = $state<{ id: string; label: string; settings: SettingDef[] }[]>([]);
	let appSettings: Record<string, string> = $state({});
	let loading = $state(true);

	// Client-only preferences
	let preferOngoing = $state(typeof window !== 'undefined' && localStorage.getItem('preferOngoingSection') === 'true');
	let defaultChapterSort = $state<'asc' | 'desc'>(
		typeof window !== 'undefined' ? (localStorage.getItem('defaultChapterSort') as 'asc' | 'desc' | null) ?? 'asc' : 'asc'
	);
	let showGridText = $state(typeof window !== 'undefined' && localStorage.getItem('showGridText') !== 'false');

	function togglePreferOngoing() {
		preferOngoing = !preferOngoing;
		localStorage.setItem('preferOngoingSection', String(preferOngoing));
	}

	function setDefaultSort(value: string) {
		defaultChapterSort = value as 'asc' | 'desc';
		localStorage.setItem('defaultChapterSort', value);
	}

	function toggleShowGridText() {
		showGridText = !showGridText;
		localStorage.setItem('showGridText', String(showGridText));
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

			// Sync local toggle state from loaded settings
			const nsfwVal = appSettings['browse.nsfwMode'];
			if (nsfwVal === 'nsfw' || nsfwVal === 'all' || nsfwVal === 'sfw') nsfwMode = nsfwVal;
			const themeVal = appSettings['ui.theme'];
			if (themeVal === 'light' || themeVal === 'dark' || themeVal === 'system') themeMode = themeVal;
		} catch (err) {
			console.error('Failed to load settings:', err);
		} finally {
			loading = false;
		}
	}

	function applyThemeMode(mode: ThemeMode) {
		if (mode === 'system') {
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			document.documentElement.classList.toggle('dark', prefersDark);
			document.documentElement.classList.toggle('light', !prefersDark);
		} else {
			document.documentElement.classList.toggle('dark', mode === 'dark');
			document.documentElement.classList.toggle('light', mode === 'light');
		}
	}

	// Follow system preference when in system mode
	$effect(() => {
		if (themeMode !== 'system') return;
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = () => applyThemeMode('system');
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	async function saveSetting(key: string, value: string) {
		appSettings = { ...appSettings, [key]: value };
		if (key === 'browse.nsfwMode') {
			nsfwMode = value as NsfwMode;
			nsfwStore.set(value as NsfwMode);
		}
		if (key === 'ui.colorScheme') {
			document.documentElement.setAttribute('data-theme', value);
		}
		if (key === 'ui.theme') {
			themeMode = value as ThemeMode;
			applyThemeMode(value as ThemeMode);
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

	function setNsfw(mode: NsfwMode) {
		saveSetting('browse.nsfwMode', mode);
	}

	function setTheme(mode: ThemeMode) {
		saveSetting('ui.theme', mode);
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

	// Color scheme preview: read actual CSS vars from each theme
	let schemeColors = $state<Record<string, { primary: string; secondary: string; tertiary: string; surface: string }>>({});
	let probeDivs = $state<HTMLDivElement>();

	function probeThemeColors() {
		if (!probeDivs) return;
		const isDark = document.documentElement.classList.contains('dark');
		const surfaceKey = isDark ? '--color-surface-900' : '--color-surface-100';
		const result: typeof schemeColors = {};
		for (const el of probeDivs.children) {
			const div = el as HTMLElement;
			const name = div.dataset.theme!;
			const cs = getComputedStyle(div);
			result[name] = {
				primary: cs.getPropertyValue('--color-primary-500').trim(),
				secondary: cs.getPropertyValue('--color-secondary-500').trim(),
				tertiary: cs.getPropertyValue('--color-tertiary-500').trim(),
				surface: cs.getPropertyValue(surfaceKey).trim(),
			};
		}
		schemeColors = result;
	}

	// All scheme values extracted from setting options
	let allSchemes = $derived(
		settingCategories
			.flatMap(c => c.settings)
			.find(s => s.key === 'ui.colorScheme')?.options ?? []
	);
	let currentScheme = $derived(appSettings['ui.colorScheme'] ?? 'reign');

	$effect(() => {
		loadAll();
	});

	let currentThemeMode = $derived(appSettings['ui.theme'] ?? 'dark');

	$effect(() => {
		void currentThemeMode;
		if (probeDivs && allSchemes.length > 0) probeThemeColors();
	});
</script>

<h2 class="h4">Settings</h2>

{#if loading}
	<LoadingSpinner />
{:else}
	<!-- Appearance -->
	<div class="card bg-surface-100-900 rounded-lg p-6 mb-6">
		<h3 class="h5">Appearance</h3>

		<div class="settings-grid">
			<div class="setting-item">
				<label class="text-sm">Content Filter</label>
				<div class="btn-group">
					<button class="btn-group__item" class:active={nsfwMode === 'sfw'} onclick={() => setNsfw('sfw')}>
						<img src="/filter-sfw.png" alt="" class="filter-icon" class:invert={themeMode === 'light' || (themeMode === 'system' && !document.documentElement.classList.contains('dark'))} />
						<span>SFW</span>
					</button>
					<button class="btn-group__item" class:active={nsfwMode === 'all'} onclick={() => setNsfw('all')}>
						<img src="/filter-all.png" alt="" class="filter-icon" class:invert={themeMode === 'light' || (themeMode === 'system' && !document.documentElement.classList.contains('dark'))} />
						<span>All</span>
					</button>
					<button class="btn-group__item" class:active={nsfwMode === 'nsfw'} onclick={() => setNsfw('nsfw')}>
						<img src="/filter-nsfw.png" alt="" class="filter-icon" class:invert={themeMode === 'light' || (themeMode === 'system' && !document.documentElement.classList.contains('dark'))} />
						<span>NSFW</span>
					</button>
				</div>
			</div>
			<div class="setting-item">
				<label class="text-sm">Theme</label>
				<div class="btn-group">
					<button class="btn-group__item" class:active={themeMode === 'light'} onclick={() => setTheme('light')}>
						<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
						<span>Light</span>
					</button>
					<button class="btn-group__item" class:active={themeMode === 'dark'} onclick={() => setTheme('dark')}>
						<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>
						<span>Dark</span>
					</button>
					<button class="btn-group__item" class:active={themeMode === 'system'} onclick={() => setTheme('system')}>
						<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>
						<span>System</span>
					</button>
				</div>
			</div>
		</div>

		{#if allSchemes.length > 0}
			<label class="text-sm scheme-label">Color Scheme</label>
			<div class="scheme-grid">
				{#each allSchemes as scheme}
					{@const colors = schemeColors[scheme.value]}
					<button
						class="scheme-card"
						class:active={currentScheme === scheme.value}
						onclick={() => saveSetting('ui.colorScheme', scheme.value)}
						title={scheme.label}
					>
						<div class="scheme-preview" style="background: {colors?.surface ?? '#222'}">
							<div class="scheme-dots">
								<span class="scheme-dot" style="background: {colors?.primary ?? '#666'}"></span>
								<span class="scheme-dot" style="background: {colors?.secondary ?? '#666'}"></span>
								<span class="scheme-dot" style="background: {colors?.tertiary ?? '#666'}"></span>
							</div>
							<div class="scheme-bar" style="background: {colors?.primary ?? '#666'}"></div>
						</div>
						<span class="scheme-name">{scheme.label}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Server settings (from manifest, excluding appearance ones) -->
	{#each settingCategories as category}
		{@const guiSettings = category.settings.filter(s => (!s.platforms || s.platforms.includes('gui')) && s.key !== 'ui.colorScheme' && s.key !== 'browse.nsfwMode' && s.key !== 'ui.theme')}
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
				<label class="text-sm">Show text in grid view</label>
				<button
					class="btn btn-sm {showGridText ? 'preset-filled-primary-500' : 'preset-tonal-primary'}"
					onclick={toggleShowGridText}
				>
					{showGridText ? 'On' : 'Off'}
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

<!-- Hidden probe divs to read CSS vars for each theme -->
<div class="scheme-probes" bind:this={probeDivs} aria-hidden="true">
	{#each allSchemes as scheme}
		<div data-theme={scheme.value}></div>
	{/each}
</div>

<style>
	.scheme-probes {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
		pointer-events: none;
		opacity: 0;
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

	@media (max-width: 600px) {
		.setting-item { flex-direction: column; align-items: flex-start; gap: 6px; }
	}

	/* ── Button group toggle ── */

	.btn-group {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: 5px;
		background: color-mix(in oklch, var(--layer-border) 25%, transparent);
	}

	.btn-group__item {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		padding: 5px 10px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: rgb(var(--color-surface-400));
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.btn-group__item:hover {
		background: color-mix(in oklch, var(--layer-border) 40%, transparent);
	}

	.btn-group__item.active {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
		box-shadow: 0 2px 8px color-mix(in oklch, var(--color-primary-500) 25%, transparent);
	}

	.filter-icon {
		width: 22px;
		height: 22px;
		object-fit: contain;
	}

	.filter-icon.invert { filter: invert(1); }
	.btn-group__item.active .filter-icon { filter: invert(1) !important; }

	/* ── Color scheme picker ── */

	.scheme-label {
		display: block;
		margin-top: 16px;
		margin-bottom: 8px;
	}

	.scheme-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
		gap: 8px;
	}

	.scheme-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 6px;
		border: 2px solid transparent;
		border-radius: 7px;
		background: none;
		cursor: pointer;
		transition: border-color 0.15s, transform 0.15s;
	}

	.scheme-card:hover {
		border-color: var(--layer-border);
		transform: translateY(-1px);
	}

	.scheme-card.active {
		border-color: rgb(var(--color-primary-500));
	}

	.scheme-preview {
		width: 100%;
		aspect-ratio: 16 / 10;
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px;
		overflow: hidden;
	}

	.scheme-dots {
		display: flex;
		gap: 5px;
	}

	.scheme-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}

	.scheme-bar {
		width: 60%;
		height: 4px;
		border-radius: 2px;
		opacity: 0.7;
	}

	.scheme-name {
		font-size: 0.7rem;
		font-weight: 500;
		color: rgb(var(--color-surface-400));
		line-height: 1;
	}

	.scheme-card.active .scheme-name {
		color: rgb(var(--color-primary-500));
	}
</style>
