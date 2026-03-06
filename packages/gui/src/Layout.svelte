<script lang="ts">
	import './app.css';
	import { url } from '$lib/router.js';
	import type { Snippet } from 'svelte';
	import { nsfwMode as nsfwStore } from '$lib/stores/nsfw.js';
	import type { NsfwMode } from '$lib/stores/nsfw.js';
	import type { AppManifest } from '@omo/core';
	import Titlebar from '$lib/components/Titlebar.svelte';

	let { children }: { children: Snippet } = $props();

	let sidebarOpen = $state(false);
	let isReaderMode = $derived(url.searchParams.get('mode') === 'reader');

	// Manifest-driven state
	let manifest = $state<AppManifest | null>(null);
	let navStatic = $derived(manifest?.nav.static.filter(n => !n.platforms || n.platforms.includes('gui')) ?? []);
	let navLibraries = $derived(
		(manifest?.nav.libraries ?? []).filter(lib => {
			if (nsfwMode === 'all') return true;
			if (nsfwMode === 'nsfw') return lib.nsfw;
			return !lib.nsfw;
		})
	);
	let navCollections = $derived(manifest?.nav.collections ?? []);
	let homeNavItem = $derived(navStatic.find(n => n.id === 'home'));

	// Global NSFW mode
	let nsfwMode = $state<NsfwMode>('sfw');
	const nsfwCycle: NsfwMode[] = ['sfw', 'all', 'nsfw'];

	// Theme mode
	type ThemeMode = 'dark' | 'light';
	let themeMode = $state<ThemeMode>('dark');

	let logoSrc = $derived(themeMode === 'light' ? '/omo-black.png' : '/omo-white.png');

	const libraryTypeIcons: Record<string, string> = {
		manga: '\ud83d\udcda',
		western: '\ud83d\udcd6',
		webcomic: '\ud83c\udf10',
	};

	// SVG icon map keyed by manifest icon IDs
	const NAV_ICONS: Record<string, string> = {
		home: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
		library: '<path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>',
		search: '<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>',
		sources: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>',
		extensions: '<path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/>',
		settings: '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>',
	};

	async function loadManifest() {
		try {
			const res = await fetch('/api/manifest');
			if (res.ok) {
				manifest = await res.json();
				// Apply settings from manifest
				const vals = manifest!.settings.values;
				const nsfwVal = vals['browse.nsfwMode'];
				if (nsfwVal === 'nsfw' || nsfwVal === 'all') nsfwMode = nsfwVal;
				else nsfwMode = 'sfw';
				nsfwStore.set(nsfwMode);
				const theme = vals['ui.theme'];
				if (theme === 'light') {
					themeMode = 'light';
					document.documentElement.classList.add('light');
				}
			}
		} catch { /* ignore */ }
	}

	async function refreshManifest() {
		try {
			const res = await fetch('/api/manifest');
			if (res.ok) manifest = await res.json();
		} catch { /* ignore */ }
	}

	async function setNsfwMode(mode: NsfwMode) {
		nsfwMode = mode;
		nsfwStore.set(mode);
		await fetch('/api/settings/app', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 'browse.nsfwMode': mode }),
		}).catch(() => {});
	}

	function cycleNsfw() {
		const idx = nsfwCycle.indexOf(nsfwMode);
		setNsfwMode(nsfwCycle[(idx + 1) % nsfwCycle.length]);
	}

	async function toggleTheme() {
		const next: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';
		themeMode = next;
		document.documentElement.classList.toggle('light', next === 'light');
		await fetch('/api/settings/app', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 'ui.theme': next }),
		}).catch(() => {});
	}

	$effect(() => {
		loadManifest();

		function onLibrariesChanged() {
			refreshManifest();
		}
		function onCollectionsChanged() {
			refreshManifest();
		}
		window.addEventListener('libraries-changed', onLibrariesChanged);
		window.addEventListener('collections-changed', onCollectionsChanged);
		return () => {
			window.removeEventListener('libraries-changed', onLibrariesChanged);
			window.removeEventListener('collections-changed', onCollectionsChanged);
		};
	});
</script>

<Titlebar />

{#if isReaderMode}
	<div class="reader-only">
		{@render children()}
	</div>
{:else}
	<div class="app-layout">
		<nav class="sidebar" class:open={sidebarOpen}>
			<div class="sidebar-header">
				<a href="/" class="logo">
					<img src={logoSrc} alt="OMO" class="logo-img" />
				</a>
			</div>

			<ul class="sidebar-nav">
				{#if homeNavItem}
					<li>
						<a href={homeNavItem.route} onclick={() => sidebarOpen = false}>
							<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">{@html NAV_ICONS[homeNavItem.icon] ?? ''}</svg>
							{homeNavItem.label}
						</a>
					</li>
				{/if}

				{#if navLibraries.length > 0}
					{@const libNavItem = navStatic.find(n => n.id === 'library')}
					<li class="sidebar-divider"><a href={libNavItem?.route ?? '/library'} onclick={() => sidebarOpen = false}>Libraries</a></li>
					{#each navLibraries as lib}
						<li>
							<a href="/library/{lib.id}" onclick={() => sidebarOpen = false}>
								<span class="lib-type-icon">{libraryTypeIcons[lib.type] ?? ''}</span>
								{lib.label}
							</a>
						</li>
					{/each}
					<li class="sidebar-divider"></li>
				{/if}

				{#if navCollections.length > 0}
					<li class="sidebar-divider"><span>Collections</span></li>
					{#each navCollections as col}
						<li>
							<a href="/collection/{col.id}" onclick={() => sidebarOpen = false}>
								<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
								{col.label}
							</a>
						</li>
					{/each}
					<li class="sidebar-divider"></li>
				{/if}

				{#each navStatic.filter(n => n.id !== 'home') as item (item.id)}
					<li>
						<a href={item.route} onclick={() => sidebarOpen = false}>
							<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">{@html NAV_ICONS[item.icon] ?? ''}</svg>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>

			<div class="sidebar-filter">
				<div class="filter-row">
					<button class="icon-btn nsfw-toggle" onclick={cycleNsfw} title="Content filter: {nsfwMode}">
						<div class="filter-icon-wrap">
							{#each nsfwCycle as mode (mode)}
								<img
									src="/filter-{mode}.png"
									alt="{mode} filter"
									class="filter-icon"
									class:active={nsfwMode === mode}
								/>
							{/each}
						</div>
					</button>
					<button class="icon-btn theme-toggle" onclick={toggleTheme} title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
						{#if themeMode === 'dark'}
							<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
						{:else}
							<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>
						{/if}
					</button>
				</div>
			</div>
		</nav>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		{#if sidebarOpen}
			<div class="sidebar-backdrop" onclick={() => sidebarOpen = false}></div>
		{/if}

		<div class="main-content">
			<header class="mobile-header">
				<button class="menu-toggle" onclick={() => sidebarOpen = !sidebarOpen}>
					<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
				</button>
				<img src={logoSrc} alt="OMO" class="mobile-logo" />
			</header>

			<main>
				{@render children()}
			</main>
		</div>
	</div>

{/if}

<style>
	.reader-only {
		background: #000;
		min-height: 100vh;
	}

	.app-layout {
		display: flex;
		height: 100vh;
		overflow: hidden;
	}

	.sidebar {
		width: var(--sidebar-width);
		border-right: 1px solid var(--border-color);
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		z-index: 500;
		display: flex;
		flex-direction: column;
		transition: transform 0.2s;
	}

	.sidebar-header {
		padding: 20px 16px;
		border-bottom: 1px solid var(--border-color);
	}

	.logo {
		display: block;
		text-decoration: none !important;
	}

	.logo-img {
		height: 28px;
		width: auto;
	}

	.sidebar-nav {
		list-style: none;
		padding: 8px 0;
		margin: 0;
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}

	.sidebar-nav li a {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
		color: var(--text-secondary) !important;
		text-decoration: none !important;
		font-size: 0.9rem;
		transition: background 0.15s, color 0.15s;
	}

	.sidebar-nav li a:hover {
		background: rgba(128,128,128,0.1);
		color: var(--text-primary) !important;
	}

	.sidebar-divider {
		padding: 6px 16px 2px;
	}

	.sidebar-divider span,
	.sidebar-divider > a {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-secondary);
		opacity: 0.6;
		text-decoration: none;
	}

	.sidebar-divider > a:hover {
		opacity: 1;
	}

	.sidebar-divider:empty {
		padding: 0;
		margin: 4px 16px;
		border-bottom: 1px solid var(--border-color);
	}

	.lib-type-icon {
		font-size: 16px;
		line-height: 1;
	}

	.sidebar-filter {
		margin-top: auto;
		padding: 12px 16px;
		border-top: 1px solid var(--border-color);
	}

	.filter-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px;
		border-radius: 6px;
		color: var(--text-secondary);
		transition: background 0.15s, color 0.15s;
	}

	.icon-btn:hover {
		background: rgba(128,128,128,0.15);
		color: var(--text-primary);
	}

	.filter-icon-wrap {
		position: relative;
		width: 28px;
		height: 28px;
	}

	.filter-icon {
		position: absolute;
		inset: 0;
		width: 28px;
		height: 28px;
		object-fit: contain;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.filter-icon.active {
		opacity: 1;
	}

	.theme-toggle svg {
		display: block;
	}

	.sidebar-backdrop {
		display: none;
	}

	.mobile-header {
		display: none;
	}

	.main-content {
		flex: 1;
		margin-left: var(--sidebar-width);
		height: 100vh;
		overflow-y: auto;
	}

	main {
		padding: 24px;
		max-width: 1400px;
	}

	@media (max-width: 768px) {
		.sidebar {
			transform: translateX(-100%);
		}

		.sidebar.open {
			transform: translateX(0);
		}

		.sidebar-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			background: rgba(0,0,0,0.5);
			z-index: 499;
		}

		.mobile-header {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 12px 16px;
			border-bottom: 1px solid var(--border-color);
			position: sticky;
			top: 0;
			z-index: 100;
		}

		.menu-toggle {
			background: none;
			border: none;
			color: var(--text-primary);
			cursor: pointer;
			padding: 4px;
		}

		.mobile-logo {
			height: 22px;
			width: auto;
		}

		.main-content {
			margin-left: 0;
		}

		main {
			padding: 16px;
		}
	}
</style>
