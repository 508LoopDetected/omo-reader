<script lang="ts">
	import './app.css';
	import 'overlayscrollbars/overlayscrollbars.css';
	import { url, goto } from '$lib/router.js';
	import type { Snippet } from 'svelte';
	import { nsfwMode as nsfwStore } from '$lib/stores/nsfw.js';
	import type { NsfwMode } from '$lib/stores/nsfw.js';
	import type { AppManifest, WorkEntry, Source } from '@omo/core';
	import { Navigation } from '@skeletonlabs/skeleton-svelte';
	import { OverlayScrollbarsComponent } from 'overlayscrollbars-svelte';
	import WorkCard from '$lib/components/library/WorkCard.svelte';
	import WorkGrid from '$lib/components/WorkGrid.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	let { children }: { children: Snippet } = $props();

	/** One-shot page-entry animation: adds .page-enter to new direct children of <main>, removes after animation to prevent OverlayScrollbars replays. */
	function pageEntry(main: HTMLElement) {
		let tracked = new Set<Element>();
		const obs = new MutationObserver(() => {
			for (const child of main.children) {
				if (!tracked.has(child)) {
					tracked.add(child);
					child.classList.add('page-enter');
					child.addEventListener('animationend', () => child.classList.remove('page-enter'), { once: true });
				}
			}
			// prune removed elements
			for (const el of tracked) {
				if (!el.parentNode) tracked.delete(el);
			}
		});
		obs.observe(main, { childList: true });
		// handle initial children
		for (const child of main.children) {
			tracked.add(child);
			child.classList.add('page-enter');
			child.addEventListener('animationend', () => child.classList.remove('page-enter'), { once: true });
		}
		return { destroy() { obs.disconnect(); } };
	}

	let sidebarExpanded = $state(false);
	let sidebarMobileOpen = $state(false);
	let isReaderMode = $derived(
		url.searchParams.get('mode') === 'reader' ||
		/^\/work\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname)
	);

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


	// Global NSFW mode — synced from store so Settings changes propagate
	let nsfwMode = $state<NsfwMode>('sfw');

	$effect(() => {
		const unsub = nsfwStore.subscribe(v => { nsfwMode = v; });
		return unsub;
	});

	// Theme mode — watch DOM class changes from Settings
	type ThemeMode = 'dark' | 'light';
	let themeMode = $state<ThemeMode>('dark');

	$effect(() => {
		const observer = new MutationObserver(() => {
			themeMode = document.documentElement.classList.contains('light') ? 'light' : 'dark';
		});
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	});

	let logoSrc = $derived(themeMode === 'light' ? '/omo-black.png' : '/omo-white.png');

	const libraryTypeIcons: Record<string, string> = {
		manga: '\ud83d\udcda',
		western: '\ud83d\udcd6',
		webcomic: '\ud83c\udf10',
	};

	const NAV_ICONS: Record<string, string> = {
		home: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
		library: '<path d="M12 11.55C9.64 9.35 6.48 8 3 8v11c3.48 0 6.64 1.35 9 3.55 2.36-2.19 5.52-3.55 9-3.55V8c-3.48 0-6.64 1.35-9 3.55zM12 8c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z"/>',
		sources: '<path d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/>',
		extensions: '<path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/>',
		settings: '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>',
	};

	const COLLECTION_ICON = '<path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>';

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
		document.documentElement.classList.add('electron');
		api.isMaximized().then((v: boolean) => isMaximized = v);
		api.onMaximizedChange((v: boolean) => {
			isMaximized = v;
			document.documentElement.classList.toggle('electron-maximized', v);
		});
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

	function isActiveRoute(route: string): boolean {
		if (route === '/') return url.pathname === '/';
		return url.pathname.startsWith(route);
	}

	function activeClass(route: string): string {
		return isActiveRoute(route) ? 'nav-active' : '';
	}

	function activeClassExact(path: string): string {
		return url.pathname === path ? 'nav-active' : '';
	}

	function navClick() {
		sidebarMobileOpen = false;
		clearSearch();
	}

	async function loadManifest() {
		try {
			const res = await fetch('/api/manifest');
			if (res.ok) {
				manifest = await res.json();
				const vals = manifest!.settings.values;
				const nsfwVal = vals['browse.nsfwMode'];
				nsfwStore.set(nsfwVal === 'nsfw' || nsfwVal === 'all' ? nsfwVal : 'sfw');
				const theme = vals['ui.theme'];
				if (theme === 'system') {
					const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
					document.documentElement.classList.toggle('dark', prefersDark);
					document.documentElement.classList.toggle('light', !prefersDark);
				} else if (theme === 'light') {
					document.documentElement.classList.remove('dark');
					document.documentElement.classList.add('light');
				}
				const scheme = vals['ui.colorScheme'];
				if (scheme) {
					document.documentElement.setAttribute('data-theme', scheme);
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
		{#if !isFullscreen}
			<header class="top-header" class:desktop={isDesktop}>
				<div class="header-left">
					<button class="mobile-menu-btn" onclick={() => sidebarMobileOpen = !sidebarMobileOpen} aria-label="Menu">
						<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
					</button>
					<a href="/" class="block no-underline!" onclick={() => { clearSearch(); sidebarMobileOpen = false; }}>
						<img src={logoSrc} alt="OMO" class="h-5.5 w-auto opacity-90 hover:opacity-100 transition-opacity" />
					</a>
				</div>

				<div class="flex-1 flex justify-center max-w-[480px] mx-auto">
					<div class="search-field">
						<svg class="search-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
						<input
							bind:this={searchInputEl}
							type="text"
							class="search-input"
							placeholder="Search all sources..."
							bind:value={searchQuery}
							onkeydown={onSearchKeydown}
							onfocus={() => { if (searchResults.length > 0) searchActive = true; }}
						/>
						{#if searchQuery}
							<button class="search-clear" onclick={clearSearch} aria-label="Clear search">
								<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
							</button>
						{:else}
							<kbd class="search-hint">&#8984;K</kbd>
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
						<div class="header-divider"></div>
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

		<div class="flex flex-1 overflow-hidden content-area" class:h-screen={isFullscreen}>
			<!-- ── Sidebar ── -->
			<div class="sidebar-wrapper" class:expanded={sidebarExpanded} class:mobile-open={sidebarMobileOpen}>
				<Navigation layout="rail" class="sidebar-nav">
					<Navigation.Content>
						<Navigation.Menu>
							<Navigation.Trigger onclick={() => sidebarExpanded = !sidebarExpanded} class="expand-toggle" title={sidebarExpanded ? 'Collapse' : 'Expand'}>
								<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="expand-chevron" class:flipped={sidebarExpanded}>
									<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
								</svg>
								{#if sidebarExpanded}
									<Navigation.TriggerText>Collapse</Navigation.TriggerText>
								{/if}
							</Navigation.Trigger>
						</Navigation.Menu>

						{@const libNavItem = navStatic.find(n => n.id === 'library')}
						{#if libNavItem}
							<Navigation.Menu>
								<Navigation.TriggerAnchor href={libNavItem.route} class={activeClassExact(libNavItem.route)} onclick={navClick} title={sidebarExpanded ? undefined : libNavItem.label}>
									<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">{@html NAV_ICONS[libNavItem.icon] ?? ''}</svg>
									{#if sidebarExpanded}
										<Navigation.TriggerText>{libNavItem.label}</Navigation.TriggerText>
									{/if}
								</Navigation.TriggerAnchor>
							</Navigation.Menu>
						{/if}

						{#if navLibraries.length > 0}
							<Navigation.Group>
								<Navigation.Menu>
									{#each navLibraries as lib}
										<Navigation.TriggerAnchor href="/library/{lib.id}" class={activeClassExact(`/library/${lib.id}`)} onclick={navClick} title={sidebarExpanded ? undefined : lib.label}>
											<span class="nav-emoji">{libraryTypeIcons[lib.type] ?? ''}</span>
											{#if sidebarExpanded}
												<Navigation.TriggerText>{lib.label}</Navigation.TriggerText>
											{/if}
										</Navigation.TriggerAnchor>
									{/each}
								</Navigation.Menu>
							</Navigation.Group>
						{/if}

						{#if navCollections.length > 0}
							<Navigation.Group>
								<Navigation.Menu>
									{#each navCollections as col}
										<Navigation.TriggerAnchor href="/collection/{col.id}" class={activeClassExact(`/collection/${col.id}`)} onclick={navClick} title={sidebarExpanded ? undefined : col.label}>
											<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">{@html COLLECTION_ICON}</svg>
											{#if sidebarExpanded}
												<Navigation.TriggerText>{col.label}</Navigation.TriggerText>
											{/if}
										</Navigation.TriggerAnchor>
									{/each}
								</Navigation.Menu>
							</Navigation.Group>
						{/if}

						<Navigation.Group>
						<Navigation.Menu>
							{#each navStatic.filter(n => n.id !== 'home' && n.id !== 'search' && n.id !== 'settings' && n.id !== 'library') as item (item.id)}
								<Navigation.TriggerAnchor href={item.route} class={activeClass(item.route)} onclick={navClick} title={sidebarExpanded ? undefined : item.label}>
									<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">{@html NAV_ICONS[item.icon] ?? ''}</svg>
									{#if sidebarExpanded}
										<Navigation.TriggerText>{item.label}</Navigation.TriggerText>
									{/if}
								</Navigation.TriggerAnchor>
							{/each}
						</Navigation.Menu>
						</Navigation.Group>
					</Navigation.Content>

					<Navigation.Footer>
						<Navigation.TriggerAnchor href="/settings" class={activeClass('/settings')} onclick={navClick} title={sidebarExpanded ? undefined : 'Settings'}>
							<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">{@html NAV_ICONS['settings']}</svg>
							{#if sidebarExpanded}
								<Navigation.TriggerText>Settings</Navigation.TriggerText>
							{/if}
						</Navigation.TriggerAnchor>
					</Navigation.Footer>
				</Navigation>
			</div>

			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			{#if sidebarMobileOpen}
				<div class="sidebar-backdrop" onclick={() => sidebarMobileOpen = false}></div>
			{/if}

			<!-- ── Main Content ── -->
			<OverlayScrollbarsComponent
				element="div"
				class="flex-1"
				options={{
					scrollbars: { autoHide: 'scroll', autoHideDelay: 800 },
					overflow: { x: 'hidden' },
				}}
			>
				<main class="p-7" style="padding-top: calc(var(--header-height) + 20px);" use:pageEntry>
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
			</OverlayScrollbarsComponent>
		</div>
	</div>
{/if}

<style>
	/* ── Top Header ── */

	.top-header {
		display: flex;
		align-items: center;
		gap: 16px;
		min-height: var(--header-height);
		padding: 10px 20px;
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1000;
		background: color-mix(in oklab, var(--color-surface-50-950) 30%, transparent);
		backdrop-filter: blur(16px) saturate(180%);
		-webkit-backdrop-filter: blur(16px) saturate(180%);
		box-shadow: var(--shadow-raised);
	}


	.top-header.desktop { -webkit-app-region: drag; }
	.top-header.desktop :global(.search-field),
	.top-header.desktop :global(.header-btn),
	.top-header.desktop :global(a),
	.top-header.desktop :global(button) { -webkit-app-region: no-drag; }

	.header-left {
		display: flex;
		align-items: center;
		gap: 10px;
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
		background: color-mix(in oklch, var(--layer-raised) 60%, transparent);
		border: none;
		border-radius: 5px;
		padding: 0 12px;
		height: 32px;
		transition: all var(--transition-smooth);
		box-shadow: inset 0 1px 2px rgba(0,0,0,0.04);
	}

	.search-field:hover { border-color: var(--layer-border); }

	.search-field:focus-within {
		background: var(--layer-raised);
		border-color: rgb(var(--color-primary-500));
		box-shadow: 0 0 0 3px rgb(var(--color-primary-500) / 0.15), inset 0 0 0 transparent;
	}

	.search-icon { color: rgb(var(--color-surface-400)); flex-shrink: 0; }

	.search-input {
		flex: 1; border: none; background: transparent;
		font-size: 0.875rem; outline: none; min-width: 0; color: inherit;
	}

	.search-input::placeholder { color: rgb(var(--color-surface-400)); }

	.search-clear {
		display: flex; align-items: center; justify-content: center;
		width: 18px; height: 18px; border: none; border-radius: 50%;
		background: var(--layer-border-subtle); color: rgb(var(--color-surface-500));
		cursor: pointer; transition: all var(--transition-fast);
	}

	.search-clear:hover { background: var(--layer-border); }

	.search-hint {
		font-size: 0.6rem; color: rgb(var(--color-surface-400)); font-family: inherit;
		border: 1px solid var(--layer-border-subtle); border-radius: 3px; padding: 1px 4px;
	}

	/* ── Header buttons ── */

	.header-btn {
		display: flex; align-items: center; justify-content: center;
		width: 28px; height: 26px; border: none; border-radius: 4px;
		background: none; color: rgb(var(--color-surface-400));
		cursor: pointer; transition: all var(--transition-fast);
	}

	.header-btn:hover { background: var(--layer-sunken); color: inherit; }
	.header-btn:active { transform: scale(0.92); }

	.header-divider { width: 1px; height: 14px; margin: 0 4px; background: var(--layer-border-subtle); }

	.header-close:hover { background: rgb(232 17 35 / 0.8) !important; color: white !important; }

	/* ── Sidebar Wrapper ── */

	.sidebar-wrapper {
		width: 96px;
		margin: 0 10px;
		border-radius: 0;
		border: none;
		border-right: 1px solid color-mix(in oklch, var(--color-surface-400) 15%, transparent);
		background: radial-gradient(ellipse at right center, color-mix(in oklch, var(--color-surface-400) 10%, transparent) 0%, transparent 70%);
		flex-shrink: 0;
		align-self: center;
		overflow: hidden;
		transition: width var(--transition-smooth);
	}

	.sidebar-wrapper.expanded {
		width: 238px;
	}

	/* Override Skeleton's navigation defaults */
	.sidebar-wrapper :global(.sidebar-nav) {
		width: 100% !important;
		padding: 28px !important;
		gap: 0 !important;
		background: transparent !important;
	}

	.sidebar-wrapper :global([data-part="content"]) {
		overflow-y: auto;
		overflow-x: hidden;
		min-height: 0;
		display: flex !important;
		flex-direction: column !important;
		gap: 2px !important;
		padding-bottom: 4px !important;
	}

	.sidebar-wrapper :global([data-part="footer"]) {
		padding: 10px 0 0;
		margin-top: 0;
		position: relative;
	}

	.sidebar-wrapper :global([data-part="footer"])::before {
		content: '';
		display: block;
		width: 60%;
		height: 1px;
		margin: 0 auto 8px;
		background: var(--layer-border);
		border-radius: 1px;
	}

	.sidebar-wrapper.expanded :global([data-part="footer"])::before {
		width: calc(100% - 20px);
	}

	.sidebar-wrapper :global([data-part="menu"]) {
		display: flex !important;
		flex-direction: column !important;
		gap: 1px !important;
		flex: unset !important;
		justify-content: unset !important;
	}

	.sidebar-wrapper :global([data-part="group"]) {
		margin-top: 0;
		padding-top: 10px;
		display: flex !important;
		flex-direction: column !important;
		gap: 1px !important;
		position: relative;
	}

	/* Separator line — centered short line in collapsed, stretches in expanded */
	.sidebar-wrapper :global([data-part="group"])::before {
		content: '';
		display: block;
		width: 60%;
		height: 1px;
		margin: 0 auto 8px;
		background: var(--layer-border);
		border-radius: 1px;
	}

	.sidebar-wrapper.expanded :global([data-part="group"])::before {
		width: calc(100% - 20px);
	}

	.sidebar-wrapper :global([data-part="trigger-anchor"]),
	.sidebar-wrapper :global([data-part="trigger"]) {
		justify-content: center !important;
	}

	.sidebar-wrapper :global([data-part="trigger-anchor"]:active),
	.sidebar-wrapper :global([data-part="trigger"]:active) {
		transform: scale(0.97) !important;
	}


	/* Icon sizing */
	.sidebar-wrapper :global([data-part="trigger-anchor"] svg),
	.sidebar-wrapper :global([data-part="trigger"] svg) {
		flex-shrink: 0;
		width: 21px;
		height: 21px;
	}

	.sidebar-wrapper :global(.nav-emoji) {
		font-size: 1.25rem;
		line-height: 1;
		flex-shrink: 0;
		width: 21px;
		text-align: center;
	}

	/* Trigger text */
	.sidebar-wrapper :global([data-part="trigger-text"]) {
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		text-align: left;
		line-height: 1.3;
		font-size: 0.95rem;
	}

	/* Theme toggle */
	/* Expand chevron */
	.expand-chevron {
		transition: transform var(--transition-smooth);
	}

	.expand-chevron.flipped {
		transform: rotate(180deg);
	}

	.sidebar-backdrop { display: none; }

	/* ── Responsive ── */

	@media (max-width: 768px) {
		.header-left { width: auto; }
		.mobile-menu-btn { display: flex; }

		.sidebar-wrapper {
			position: fixed;
			top: var(--header-height);
			left: 0;
			bottom: 0;
			width: 200px !important;
			margin: 0;
			border-radius: 0;
			z-index: 500;
			transform: translateX(-100%);
			transition: transform var(--transition-smooth);
			box-shadow: none;
		}

		.sidebar-wrapper :global([data-part="trigger-anchor"]),
		.sidebar-wrapper :global([data-part="trigger"]) {
			justify-content: flex-start !important;
		}

		.sidebar-wrapper :global([data-part="group"])::before,
		.sidebar-wrapper :global([data-part="footer"])::before {
			width: calc(100% - 20px);
		}

		.sidebar-wrapper.mobile-open {
			transform: translateX(0);
			box-shadow: var(--shadow-overlay);
		}

		.sidebar-wrapper :global(.expand-toggle) {
			display: none !important;
		}

		.sidebar-backdrop {
			display: block;
			position: fixed;
			top: var(--header-height);
			left: 0; right: 0; bottom: 0;
			background: rgba(0, 0, 0, 0.4);
			backdrop-filter: blur(6px);
			-webkit-backdrop-filter: blur(6px);
			z-index: 499;
			animation: fadeIn 0.2s ease-out;
		}

		@keyframes fadeIn {
			from { opacity: 0; }
			to { opacity: 1; }
		}
	}
</style>
