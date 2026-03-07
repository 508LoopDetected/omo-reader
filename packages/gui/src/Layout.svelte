<script lang="ts">
	import './app.css';
	import { url, goto } from '$lib/router.js';
	import type { Snippet } from 'svelte';
	import { nsfwMode as nsfwStore } from '$lib/stores/nsfw.js';
	import type { NsfwMode } from '$lib/stores/nsfw.js';
	import type { AppManifest, WorkEntry, Source } from '@omo/core';
	import WorkCard from '$lib/components/library/WorkCard.svelte';
	import WorkGrid from '$lib/components/WorkGrid.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

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

	const NAV_ICONS: Record<string, string> = {
		home: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
		library: '<path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>',
		sources: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>',
		extensions: '<path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/>',
		settings: '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>',
	};

	// ── Window controls ──
	const api = (globalThis as any).electronAPI;
	const isDesktop = !!api;
	let isFullscreen = $state(!!document.fullscreenElement);
	let isMaximized = $state(false);

	function toggleFullscreen() {
		if (document.fullscreenElement) document.exitFullscreen();
		else document.documentElement.requestFullscreen();
	}

	$effect(() => {
		function onFsChange() { isFullscreen = !!document.fullscreenElement; }
		document.addEventListener('fullscreenchange', onFsChange);
		return () => document.removeEventListener('fullscreenchange', onFsChange);
	});

	$effect(() => {
		if (!api) return;
		api.isMaximized().then((v: boolean) => isMaximized = v);
		api.onMaximizedChange((v: boolean) => isMaximized = v);
	});

	// ── Search state ──
	interface SourceResult {
		source: Source;
		items: WorkEntry[];
		hasNextPage: boolean;
	}

	let searchQuery = $state('');
	let searchResults = $state<SourceResult[]>([]);
	let searchLoading = $state(false);
	let searchActive = $state(false);
	let searchInputEl: HTMLInputElement;

	async function doSearch() {
		const q = searchQuery.trim();
		if (!q) return;
		searchLoading = true;
		searchActive = true;
		searchResults = [];
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&page=1`);
			if (res.ok) {
				const data = await res.json();
				searchResults = data.results;
			}
		} catch (err) {
			console.error('Search failed:', err);
		} finally {
			searchLoading = false;
		}
	}

	function onSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') doSearch();
		if (e.key === 'Escape') clearSearch();
	}

	function clearSearch() {
		searchQuery = '';
		searchActive = false;
		searchResults = [];
	}

	async function loadMore(sourceResult: SourceResult, index: number) {
		const nextPage = 2;
		try {
			const res = await fetch(
				`/api/sources/${sourceResult.source.id}/search?q=${encodeURIComponent(searchQuery)}&page=${nextPage}`
			);
			if (res.ok) {
				const data = await res.json();
				searchResults[index] = {
					...sourceResult,
					items: [...sourceResult.items, ...data.items],
					hasNextPage: data.hasNextPage,
				};
			}
		} catch (err) {
			console.error('Load more failed:', err);
		}
	}

	$effect(() => {
		void url.pathname;
		if (!url.pathname.startsWith('/work/')) {
			// Keep search state on same page
		}
	});

	// Keyboard shortcut: Cmd/Ctrl+K to focus search
	$effect(() => {
		function onGlobalKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				searchInputEl?.focus();
			}
		}
		window.addEventListener('keydown', onGlobalKeydown);
		return () => window.removeEventListener('keydown', onGlobalKeydown);
	});

	// ── Active route detection ──
	function isActiveRoute(route: string): boolean {
		if (route === '/') return url.pathname === '/';
		return url.pathname.startsWith(route);
	}

	// ── Manifest & settings ──
	async function loadManifest() {
		try {
			const res = await fetch('/api/manifest');
			if (res.ok) {
				manifest = await res.json();
				const vals = manifest!.settings.values;
				const nsfwVal = vals['browse.nsfwMode'];
				if (nsfwVal === 'nsfw' || nsfwVal === 'all') nsfwMode = nsfwVal;
				else nsfwMode = 'sfw';
				nsfwStore.set(nsfwMode);
				const theme = vals['ui.theme'];
				if (theme === 'light') {
					themeMode = 'light';
					document.documentElement.classList.remove('dark');
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
		document.documentElement.classList.toggle('dark', next === 'dark');
		document.documentElement.classList.toggle('light', next === 'light');
		await fetch('/api/settings/app', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 'ui.theme': next }),
		}).catch(() => {});
	}

	$effect(() => {
		loadManifest();
		function onLibrariesChanged() { refreshManifest(); }
		function onCollectionsChanged() { refreshManifest(); }
		window.addEventListener('libraries-changed', onLibrariesChanged);
		window.addEventListener('collections-changed', onCollectionsChanged);
		return () => {
			window.removeEventListener('libraries-changed', onLibrariesChanged);
			window.removeEventListener('collections-changed', onCollectionsChanged);
		};
	});
</script>

{#if isReaderMode}
	<div class="bg-black min-h-screen">
		{@render children()}
	</div>
{:else}
	<div class="flex flex-col h-screen overflow-hidden">
		<!-- ── Top Header Bar ── -->
		{#if !isFullscreen}
			<header class="top-header" class:desktop={isDesktop}>
				<div class="header-left">
					<button class="mobile-menu-btn" onclick={() => sidebarOpen = !sidebarOpen} aria-label="Menu">
						<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
					</button>
					<a href="/" class="block no-underline!" onclick={() => { clearSearch(); sidebarOpen = false; }}>
						<img src={logoSrc} alt="OMO" class="h-5.5 w-auto opacity-90 hover:opacity-100 transition-opacity" />
					</a>
				</div>

				<div class="flex-1 flex justify-center max-w-[480px] mx-auto">
					<div class="search-field">
						<svg class="text-surface-500 shrink-0 opacity-60" viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
						<input
							bind:this={searchInputEl}
							type="text"
							class="flex-1 border-none bg-transparent text-sm outline-none min-w-0"
							placeholder="Search all sources..."
							bind:value={searchQuery}
							onkeydown={onSearchKeydown}
							onfocus={() => { if (searchResults.length > 0) searchActive = true; }}
						/>
						{#if searchQuery}
							<button class="flex items-center justify-center bg-surface-500/15 border-none rounded-full w-[18px] h-[18px] cursor-pointer text-surface-500 hover:bg-surface-500/30 hover:text-surface-200 transition-all" onclick={clearSearch} aria-label="Clear search">
								<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
							</button>
						{:else}
							<kbd class="kbd text-[0.6rem] opacity-50">&#8984;K</kbd>
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-0.5 shrink-0">
					<button class="header-btn" onclick={toggleFullscreen} title="Fullscreen">
						{#if isFullscreen}
							<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
						{:else}
							<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
						{/if}
					</button>

					{#if isDesktop}
						<div class="w-px h-3.5 mx-1 bg-surface-500/20"></div>
						<button class="header-btn" onclick={() => api.minimize()} title="Minimize">
							<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 13h12v-2H6z"/></svg>
						</button>
						<button class="header-btn" onclick={() => { isMaximized = !isMaximized; api.toggleMaximize(); }} title={isMaximized ? 'Restore' : 'Maximize'}>
							{#if isMaximized}
								<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 4v2h8v8h2V4H8zm-2 4v12h12V8H6zm10 10H8V10h8v8z"/></svg>
							{:else}
								<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6z"/></svg>
							{/if}
						</button>
						<button class="header-btn header-close" onclick={() => api.close()} title="Close">
							<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
						</button>
					{/if}
				</div>
			</header>
		{/if}

		<div class="flex flex-1 overflow-hidden" class:h-screen={isFullscreen}>
			<!-- ── Sidebar ── -->
			<nav class="sidebar" class:open={sidebarOpen}>
				<ul class="list-none p-2 m-0 flex-1 overflow-y-auto min-h-0">
					{#if homeNavItem}
						<li>
							<a href={homeNavItem.route} class="nav-link" class:active={isActiveRoute(homeNavItem.route)} onclick={() => { sidebarOpen = false; clearSearch(); }}>
								<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">{@html NAV_ICONS[homeNavItem.icon] ?? ''}</svg>
								{homeNavItem.label}
							</a>
						</li>
					{/if}

					{#if navLibraries.length > 0}
						{@const libNavItem = navStatic.find(n => n.id === 'library')}
						<li class="pt-2.5 px-3 pb-1">
							<a href={libNavItem?.route ?? '/library'} class="text-[0.65rem] uppercase tracking-wider text-surface-500 opacity-50 no-underline font-semibold hover:opacity-80" onclick={() => { sidebarOpen = false; clearSearch(); }}>Libraries</a>
						</li>
						{#each navLibraries as lib}
							<li>
								<a href="/library/{lib.id}" class="nav-link" class:active={url.pathname === `/library/${lib.id}`} onclick={() => { sidebarOpen = false; clearSearch(); }}>
									<span class="text-base leading-none">{libraryTypeIcons[lib.type] ?? ''}</span>
									{lib.label}
								</a>
							</li>
						{/each}
						<li class="mx-3 my-1.5 border-b border-surface-200-800"></li>
					{/if}

					{#if navCollections.length > 0}
						<li class="pt-2.5 px-3 pb-1">
							<span class="text-[0.65rem] uppercase tracking-wider text-surface-500 opacity-50 font-semibold">Collections</span>
						</li>
						{#each navCollections as col}
							<li>
								<a href="/collection/{col.id}" class="nav-link" class:active={url.pathname === `/collection/${col.id}`} onclick={() => { sidebarOpen = false; clearSearch(); }}>
									<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
									{col.label}
								</a>
							</li>
						{/each}
						<li class="mx-3 my-1.5 border-b border-surface-200-800"></li>
					{/if}

					{#each navStatic.filter(n => n.id !== 'home' && n.id !== 'search') as item (item.id)}
						<li>
							<a href={item.route} class="nav-link" class:active={isActiveRoute(item.route)} onclick={() => { sidebarOpen = false; clearSearch(); }}>
								<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">{@html NAV_ICONS[item.icon] ?? ''}</svg>
								{item.label}
							</a>
						</li>
					{/each}
				</ul>

				<div class="mt-auto p-3 border-t border-surface-200-800/50">
					<div class="flex items-center gap-1">
						<button class="icon-btn" onclick={cycleNsfw} title="Content filter: {nsfwMode}">
							<div class="relative w-6 h-6">
								{#each nsfwCycle as mode (mode)}
									<img
										src="/filter-{mode}.png"
										alt="{mode} filter"
										class="absolute inset-0 w-6 h-6 object-contain opacity-0 transition-opacity"
										class:!opacity-100={nsfwMode === mode}
									/>
								{/each}
							</div>
						</button>
						<button class="icon-btn" onclick={toggleTheme} title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
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

			<!-- ── Main Content ── -->
			<div class="flex-1 overflow-y-auto bg-surface-50 dark:bg-surface-950">
				<main class="p-7 max-w-[1400px]">
					{#if searchActive}
						<div class="max-w-[1200px]">
							{#if searchLoading}
								<LoadingSpinner />
								<p class="text-surface-500 text-center py-12 text-sm">Searching all sources...</p>
							{:else if searchResults.length === 0 && searchQuery.trim()}
								<p class="text-surface-500 text-center py-12 text-sm">No results found across any source.</p>
							{:else}
								{#each searchResults as sourceResult, i}
									{#if sourceResult.items.length > 0}
										<div class="mb-9">
											<div class="flex items-center gap-2.5 mb-4 pb-2.5 border-b border-surface-200-800">
												{#if sourceResult.source.iconUrl}
													<img src={sourceResult.source.iconUrl} alt="" class="w-5.5 h-5.5 rounded" />
												{/if}
												<h3 class="text-base font-semibold m-0">{sourceResult.source.name}</h3>
												<span class="text-xs text-surface-500 ml-auto">{sourceResult.items.length} result{sourceResult.items.length !== 1 ? 's' : ''}</span>
											</div>
											<WorkGrid>
												{#each sourceResult.items as work}
													<WorkCard
														title={work.title}
														coverUrl={work.coverUrl}
														sourceId={sourceResult.source.id}
														workId={work.id}
														href="/work/{sourceResult.source.id}/{encodeURIComponent(work.id)}?title={encodeURIComponent(work.title)}"
														nsfw={work.nsfw}
													/>
												{/each}
											</WorkGrid>
											{#if sourceResult.hasNextPage}
												<button class="btn preset-tonal-surface mx-auto mt-4 block text-sm" onclick={() => loadMore(sourceResult, i)}>
													Load more from {sourceResult.source.name}
												</button>
											{/if}
										</div>
									{/if}
								{/each}
							{/if}
						</div>
					{:else}
						{@render children()}
					{/if}
				</main>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ── Top Header ── */

	.top-header {
		display: flex;
		align-items: center;
		gap: 16px;
		height: var(--header-height);
		padding: 0 12px;
		background: rgb(var(--color-surface-100) / 0.75);
		backdrop-filter: blur(20px) saturate(180%);
		-webkit-backdrop-filter: blur(20px) saturate(180%);
		border-bottom: 1px solid rgb(var(--color-surface-200) / 0.15);
		flex-shrink: 0;
		z-index: 1000;
	}

	:global(.dark) .top-header {
		background: rgb(var(--color-surface-900) / 0.75);
	}

	.top-header.desktop {
		-webkit-app-region: drag;
	}

	.top-header.desktop :global(.search-field),
	.top-header.desktop :global(.header-btn),
	.top-header.desktop :global(a),
	.top-header.desktop :global(button) {
		-webkit-app-region: no-drag;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 10px;
		width: var(--sidebar-width);
		flex-shrink: 0;
		padding-left: 4px;
	}

	.mobile-menu-btn {
		display: none;
		background: none;
		border: none;
		color: currentColor;
		cursor: pointer;
		padding: 4px;
	}

	/* ── Search ── */

	.search-field {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		background: rgb(var(--color-surface-500) / 0.08);
		border: 1px solid rgb(var(--color-surface-500) / 0.1);
		border-radius: 10px;
		padding: 0 12px;
		height: 32px;
		transition: all 0.25s ease;
	}

	.search-field:hover {
		background: rgb(var(--color-surface-500) / 0.12);
	}

	.search-field:focus-within {
		background: rgb(var(--color-surface-100));
		border-color: rgb(var(--color-primary-500));
		box-shadow: 0 0 0 3px rgb(var(--color-primary-500) / 0.2);
	}

	:global(.dark) .search-field:focus-within {
		background: rgb(var(--color-surface-900));
	}

	/* ── Header buttons ── */

	.header-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 26px;
		border: none;
		border-radius: 6px;
		background: none;
		color: rgb(var(--color-surface-500));
		cursor: pointer;
		transition: all 0.15s ease;
		opacity: 0.6;
	}

	.header-btn:hover {
		background: rgb(var(--color-surface-500) / 0.15);
		opacity: 1;
	}

	.header-close:hover {
		background: rgb(232 17 35 / 0.85);
		color: white;
	}

	/* ── Sidebar ── */

	.sidebar {
		width: var(--sidebar-width);
		background: rgb(var(--color-surface-100) / 0.75);
		backdrop-filter: blur(20px) saturate(180%);
		-webkit-backdrop-filter: blur(20px) saturate(180%);
		border-right: 1px solid rgb(var(--color-surface-200) / 0.15);
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		overflow: hidden;
	}

	:global(.dark) .sidebar {
		background: rgb(var(--color-surface-900) / 0.75);
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		color: rgb(var(--color-surface-500)) !important;
		text-decoration: none !important;
		font-size: 0.85rem;
		font-weight: 450;
		border-radius: 6px;
		transition: all 0.15s ease;
	}

	.nav-link:hover {
		background: rgb(var(--color-surface-500) / 0.08);
		color: rgb(var(--color-surface-900)) !important;
	}

	:global(.dark) .nav-link:hover {
		color: rgb(var(--color-surface-100)) !important;
	}

	.nav-link.active {
		background: rgb(var(--color-primary-500) / 0.12);
		color: rgb(var(--color-primary-500)) !important;
	}

	.nav-link.active :global(svg) {
		color: rgb(var(--color-primary-500));
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		cursor: pointer;
		padding: 6px;
		border-radius: 6px;
		color: rgb(var(--color-surface-500));
		transition: all 0.15s ease;
	}

	.icon-btn:hover {
		background: rgb(var(--color-surface-500) / 0.1);
		color: rgb(var(--color-surface-800));
	}

	:global(.dark) .icon-btn:hover {
		color: rgb(var(--color-surface-200));
	}

	.sidebar-backdrop {
		display: none;
	}

	/* ── Responsive ── */

	@media (max-width: 768px) {
		.header-left {
			width: auto;
		}

		.mobile-menu-btn {
			display: flex;
		}

		.sidebar {
			position: fixed;
			top: var(--header-height);
			left: 0;
			bottom: 0;
			z-index: 500;
			transform: translateX(-100%);
			transition: transform 0.25s ease;
		}

		.sidebar.open {
			transform: translateX(0);
		}

		.sidebar-backdrop {
			display: block;
			position: fixed;
			top: var(--header-height);
			left: 0;
			right: 0;
			bottom: 0;
			background: rgba(0,0,0,0.5);
			backdrop-filter: blur(4px);
			z-index: 499;
		}
	}
</style>
