<script lang="ts">
	import type { Snippet } from 'svelte';
	import CoverImage from '$lib/components/CoverImage.svelte';
	import ReaderOverrides from '$lib/components/ReaderOverrides.svelte';
	import SidebarPane from '$lib/components/work/SidebarPane.svelte';
	import WorkStats from '$lib/components/work/WorkStats.svelte';
	import VolumeDetail from '$lib/components/work/VolumeDetail.svelte';
	import MetadataLinkModal from '$lib/components/work/MetadataLinkModal.svelte';
	import MetadataEditModal from '$lib/components/work/MetadataEditModal.svelte';
	import type { WorkEntry, Chapter, Source, UserLibrary, Collection, SettingDef } from '@omo/core';

	interface Props {
		work: WorkEntry;
		sourceId: string;
		workId: string;
		source: Source | null;
		chapters: Chapter[];
		inLibrary: boolean;
		currentLibraryId: string | null;
		userLibraries: UserLibrary[];
		allCollections: Collection[];
		titleCollectionIds: Set<string>;
		titleReaderDirection: string | null;
		titleReaderOffset: string | null;
		titleCoverArtMode: string | null;
		directionOptions: { value: string; label: string }[];
		offsetOptions: { value: string; label: string }[];
		coverArtOptions: { value: string; label: string }[];
		chaptersRead: number;
		rating: number | null;
		readingActivity: { date: string; pagesRead: number }[];
		onlineMeta: {
			provider: string; providerId: string; manualLink: boolean; fetchedAt: number;
			bannerUrl: string | null; communityScore: number | null; externalUrl: string | null;
			year: number | null; publisher: string | null;
			author: string | null; artist: string | null; description: string | null;
			genres: string[] | null; status: string | null; coverUrl: string | null;
		} | null;
		metadataOverrides: Record<string, 'local' | 'online'> | null;
		mergedCoverUrl: string | null;
		chapterSort: 'asc' | 'desc';
		chapterView: 'list' | 'grid';
		onSortChange: (sort: 'asc' | 'desc') => void;
		onViewChange: (view: 'list' | 'grid') => void;
		onback: () => void;
		onAddClick: () => void;
		onRemove: () => void;
		onAddToLibrary: (libraryId?: string) => void;
		onToggleCollection: (collectionId: string) => void;
		onReaderSettingChange: (field: 'direction' | 'offset' | 'coverArtMode', value: string | null) => void;
		onRegenerateThumbnails: () => void;
		onRatingChange: (rating: number | null) => void;
		onMetadataChange: () => void;
		continueChapter: { id: string; title: string } | null;
		headerActions?: Snippet;
		// Chapter detail mode props
		selectedChapter: Chapter | null;
		selectedVariants: Chapter[];
		selectedVariantId: string;
		chapterRead: boolean;
		chapterInProgress: boolean;
		chapterProgress?: { page: number; totalPages: number };
		hasPrev: boolean;
		hasNext: boolean;
		onPrev: () => void;
		onNext: () => void;
		onDeselect: () => void;
		onChapterVariantChange: (chapterId: string) => void;
	}

	let {
		work, sourceId, workId, source, chapters, inLibrary,
		currentLibraryId, userLibraries, allCollections, titleCollectionIds,
		titleReaderDirection, titleReaderOffset, titleCoverArtMode,
		directionOptions, offsetOptions, coverArtOptions,
		chaptersRead, rating, readingActivity, onlineMeta, metadataOverrides, mergedCoverUrl,
		chapterSort, chapterView, onSortChange, onViewChange,
		onback, onAddClick, onRemove, onAddToLibrary, onToggleCollection,
		onReaderSettingChange, onRegenerateThumbnails, onRatingChange, onMetadataChange,
		continueChapter,
		headerActions,
		selectedChapter, selectedVariants, selectedVariantId,
		chapterRead, chapterInProgress, chapterProgress,
		hasPrev, hasNext, onPrev, onNext, onDeselect, onChapterVariantChange,
	}: Props = $props();

	let showSettings = $state(false);
	let showLibraryPicker = $state(false);
	let showCollectionPicker = $state(false);
	let showMetadataModal = $state(false);
	let showMetadataEditModal = $state(false);
	let metadataFetching = $state(false);
	let sidebarExpanded = $state(false);
	let bannerEl = $state<HTMLDivElement>();

	// Track cover wipe animation — settle the previous incoming as the new base
	let wipeKey = $state(0);
	let prevChapterId = $state<string | null>(null);
	let incomingCoverUrl = $state<string | null>(null);
	let settledCoverUrl = $state<string | null>(null);
	$effect(() => {
		const newId = selectedChapter?.id ?? null;
		if (newId !== prevChapterId) {
			// Previous incoming becomes the new base
			if (incomingCoverUrl) settledCoverUrl = incomingCoverUrl;
			// Wipe in the new cover (chapter or series poster)
			if (newId === null) {
				incomingCoverUrl = coverImageUrl;
			} else {
				incomingCoverUrl = selectedChapter?.coverUrl ?? null;
			}
			wipeKey++;
			prevChapterId = newId;
		}
	});

	let isChapterMode = $derived(selectedChapter !== null);
	let sidebarMode = $derived<'stats' | 'chapter'>(isChapterMode ? 'chapter' : 'stats');

	// Cache selected chapter so snippet has valid data during fade-out
	let _cachedChapter: typeof selectedChapter = null;
	let cachedChapter = $derived.by(() => {
		if (selectedChapter) _cachedChapter = selectedChapter;
		return _cachedChapter;
	});

	// Move banner to the content-area flex parent so it spans behind the sidebar
	$effect(() => {
		if (!bannerEl) return;
		const contentArea = bannerEl.closest('.content-area');
		if (contentArea) {
			contentArea.appendChild(bannerEl);
			return () => {
				bannerEl?.remove();
			};
		}
	});

	let currentLibraryName = $derived(userLibraries.find((l) => l.id === currentLibraryId)?.name ?? 'Unsorted');

	const statusLabels: Record<string, string> = {
		ongoing: 'Ongoing', completed: 'Completed', hiatus: 'Hiatus',
		cancelled: 'Cancelled', unknown: 'Unknown',
	};

	const statusColors: Record<string, string> = {
		ongoing: 'preset-tonal-success', completed: 'preset-tonal-secondary', hiatus: 'preset-tonal-warning',
		cancelled: 'preset-tonal-error', unknown: 'preset-tonal-surface',
	};

	let coverImageUrl = $derived(mergedCoverUrl ?? work.posterUrl ?? work.coverUrl);
	let baseCoverDisplay = $derived(settledCoverUrl ?? coverImageUrl);

	// Book thickness from page count (clamped 6–40px)
	function pageThickness(pages: number): number {
		return Math.min(40, Math.max(6, 6 + pages * 0.08));
	}
	let workPageCount = $derived(chapters.reduce((sum, c) => sum + (c.pageCount ?? 0), 0));
	let baseThickness = $derived(pageThickness(isChapterMode ? (selectedChapter?.pageCount ?? 0) : workPageCount));
	let incomingThickness = $derived(pageThickness(selectedChapter?.pageCount ?? workPageCount));

	async function handleMetadataFetch() {
		metadataFetching = true;
		try {
			await fetch('/api/metadata/fetch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sourceId, workId }),
			});
			onMetadataChange();
		} catch (err) {
			console.error('Metadata fetch failed:', err);
		} finally {
			metadataFetching = false;
		}
	}

	async function handleMetadataUnlink() {
		try {
			await fetch(`/api/metadata/link?sourceId=${encodeURIComponent(sourceId)}&workId=${encodeURIComponent(workId)}`, { method: 'DELETE' });
			onMetadataChange();
		} catch (err) {
			console.error('Metadata unlink failed:', err);
		}
	}

	function handleMetadataLinked() {
		showMetadataModal = false;
		onMetadataChange();
	}

	let providerLabel = $derived(
		onlineMeta?.provider === 'mangaupdates' ? 'MangaUpdates'
		: onlineMeta?.provider === 'anilist' ? 'AniList'
		: onlineMeta?.provider === 'comicvine' ? 'Comic Vine'
		: null
	);

	function toggleSettings() {
		showSettings = !showSettings;
		if (!showSettings) {
			showLibraryPicker = false;
			showCollectionPicker = false;
		}
	}

	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.settings-anchor')) {
			showSettings = false;
			showLibraryPicker = false;
			showCollectionPicker = false;
		}
	}

	$effect(() => {
		if (showSettings) {
			document.addEventListener('click', handleClickOutside, true);
			return () => document.removeEventListener('click', handleClickOutside, true);
		}
	});
</script>

{#if work.bannerUrl}
	<div class="banner-bg" bind:this={bannerEl}>
		<img src={work.bannerUrl} alt="" class="banner-img" />
		<div class="banner-halftone">
			<img src={work.bannerUrl} alt="" class="halftone-img" />
		</div>
	</div>
{/if}

<!-- Right column: cover + metadata/detail -->
<div class="detail-sidebar" class:pane-expanded={sidebarExpanded} class:chapter-mode={isChapterMode}>
	<!-- Chapter nav (X / < >) above cover, fades with chapter mode -->
	<div class="chapter-nav" class:visible={isChapterMode}>
		<button class="nav-btn close-btn" onclick={onDeselect} aria-label="Close">
			<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
		</button>
		<div class="nav-arrows">
			<button class="nav-btn" onclick={onPrev} disabled={!hasPrev} aria-label="Previous">
				<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
			</button>
			<button class="nav-btn" onclick={onNext} disabled={!hasNext} aria-label="Next">
				<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
			</button>
		</div>
	</div>

	<div class="cover-section">
		<!-- Cover swap container -->
		<div class="cover-swap">
			<!-- Base cover — always keeps its shadow, incoming has none to avoid doubling -->
			<div class="cover-base">
				<CoverImage url={baseCoverDisplay} {sourceId} {workId} alt={work.title} loading="eager" tilt thickness={baseThickness} fallbackChar={work.title.charAt(0)} />
			</div>

			<!-- Incoming cover (overlaid with halftone wipe) -->
			{#if incomingCoverUrl}
				{#key wipeKey}
					<div class="cover-incoming halftone-wipe">
						<CoverImage url={incomingCoverUrl} {sourceId} {workId} alt={selectedChapter?.title ?? work.title} loading="eager" tilt thickness={incomingThickness} fallbackChar={(selectedChapter?.title ?? work.title).charAt(0)}>
							{#snippet overlay()}
								{/snippet}
						</CoverImage>
					</div>
				{/key}
			{/if}
		</div>

		<!-- Mobile-only title -->
		{#if !isChapterMode}
			<div class="mobile-title md:hidden">
				{#if work.logoUrl}
					<img src={work.logoUrl} alt={work.title} class="logo-title" />
				{:else}
					<h2 class="title-text">
						{#if work.iconUrl}
							<img src={work.iconUrl} alt="" class="icon-title" />
						{/if}
						{work.title}
					</h2>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Content below cover: stats or chapter detail -->
	<SidebarPane mode={sidebarMode} expanded={sidebarExpanded} onExpandChange={(v) => sidebarExpanded = v}>
		{#snippet chapter()}
			<VolumeDetail
				chapter={cachedChapter!}
				allVariants={selectedVariants}
				{sourceId}
				{workId}
				read={chapterRead}
				inProgress={chapterInProgress}
				progress={chapterProgress}
				{selectedVariantId}
				onVariantChange={onChapterVariantChange}
			/>
		{/snippet}
		{#snippet stats()}
			{#if chapters.length > 0}
				<WorkStats
					{sourceId} {workId}
					{chaptersRead}
					chaptersTotal={chapters.length}
					{rating}
					{readingActivity}
					{onRatingChange}
					communityScore={onlineMeta?.communityScore}
					provider={onlineMeta?.provider}
					externalUrl={onlineMeta?.externalUrl}
				/>
			{/if}
		{/snippet}
	</SidebarPane>
</div>

{#if showMetadataModal}
	<MetadataLinkModal
		{sourceId} {workId}
		title={work.title}
		currentProvider={onlineMeta?.provider ?? null}
		onLink={handleMetadataLinked}
		onClose={() => showMetadataModal = false}
	/>
{/if}

{#if showMetadataEditModal}
	<MetadataEditModal
		{sourceId} {workId}
		localWork={{
			author: work.author ?? null,
			artist: work.artist ?? null,
			description: work.description ?? null,
			genres: work.genres ?? null,
			status: work.status ?? null,
			coverUrl: work.coverUrl ?? null,
		}}
		onlineMeta={onlineMeta ? {
			author: onlineMeta.author ?? null,
			artist: onlineMeta.artist ?? null,
			description: onlineMeta.description ?? null,
			genres: onlineMeta.genres ?? null,
			status: onlineMeta.status ?? null,
			coverUrl: onlineMeta.coverUrl ?? null,
		} : null}
		overrides={metadataOverrides}
		onSave={() => { showMetadataEditModal = false; onMetadataChange(); }}
		onClose={() => showMetadataEditModal = false}
	/>
{/if}

<!-- Left column header: back + title + badges (hidden on mobile) -->
<div class="detail-header hidden md:block" class:has-banner={!!work.bannerUrl}>
	<div class="header-top-row">
		<button class="btn btn-sm back-btn" onclick={onback}>
			<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
			Back
		</button>
		{#if continueChapter}
			<a
				href="/work/{sourceId}/{encodeURIComponent(workId)}/{encodeURIComponent(continueChapter.id)}"
				class="btn btn-sm preset-gradient-primary-tertiary continue-btn"
			>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
				Continue &middot; {continueChapter.title}
			</a>
		{/if}
		{#if headerActions}
			<div class="header-actions">
				{@render headerActions()}
			</div>
		{/if}
		<div class="settings-anchor">
			<button class="cog-btn" class:active={showSettings} onclick={toggleSettings} title="Title settings">
				<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
			</button>

			{#if showSettings}
				<div class="settings-panel">
					<!-- Library -->
					<div class="panel-section">
						<h5 class="panel-label">Library</h5>
						{#if inLibrary}
							<div class="panel-row">
								<span class="panel-text">In library</span>
								{#if userLibraries.length > 0}
									<button class="panel-btn" onclick={() => { showLibraryPicker = !showLibraryPicker; showCollectionPicker = false; }}>
										{currentLibraryName} &#9662;
									</button>
								{/if}
							</div>
							{#if showLibraryPicker}
								<div class="sub-picker">
									<button class="picker-item" class:active={!currentLibraryId && inLibrary} onclick={() => { onAddToLibrary(); showLibraryPicker = false; }}>
										Unsorted
									</button>
									{#each userLibraries as lib}
										<button class="picker-item" class:active={currentLibraryId === lib.id} onclick={() => { onAddToLibrary(lib.id); showLibraryPicker = false; }}>
											{lib.name}
											<span class="picker-type">{lib.type}</span>
										</button>
									{/each}
								</div>
							{/if}
							{#if allCollections.length > 0}
								<div class="panel-row">
									<span class="panel-text">Collections</span>
									<button class="panel-btn" onclick={() => { showCollectionPicker = !showCollectionPicker; showLibraryPicker = false; }}>
										{titleCollectionIds.size > 0 ? `${titleCollectionIds.size} selected` : 'None'} &#9662;
									</button>
								</div>
								{#if showCollectionPicker}
									<div class="sub-picker">
										{#each allCollections as col}
											<label class="picker-checkbox">
												<input
													type="checkbox"
													checked={titleCollectionIds.has(col.id)}
													onchange={() => onToggleCollection(col.id)}
												/>
												{col.name}
											</label>
										{/each}
									</div>
								{/if}
							{/if}
							<button class="remove-btn" onclick={onRemove}>Remove from Library</button>
						{:else}
							<button class="panel-action-btn" onclick={onAddClick}>Add to Library</button>
						{/if}
					</div>

					<!-- Reader Settings -->
					{#if inLibrary}
						<div class="panel-section">
							<h5 class="panel-label">Reader</h5>
							<ReaderOverrides
								direction={titleReaderDirection ?? ''}
								offset={titleReaderOffset ?? ''}
								coverArtMode={titleCoverArtMode ?? ''}
								{directionOptions}
								{offsetOptions}
								{coverArtOptions}
								onchange={(field, value) => onReaderSettingChange(field, value)}
							/>
						</div>
					{/if}

					<!-- Display -->
					<div class="panel-section">
						<h5 class="panel-label">Display</h5>
						<div class="panel-row">
							<span class="panel-text">Sort</span>
							<button class="panel-btn" onclick={() => onSortChange(chapterSort === 'desc' ? 'asc' : 'desc')}>
								{chapterSort === 'desc' ? 'Newest first' : 'Oldest first'}
							</button>
						</div>
						<div class="panel-row">
							<span class="panel-text">View</span>
							<button class="panel-btn" onclick={() => onViewChange(chapterView === 'list' ? 'grid' : 'list')}>
								{chapterView === 'list' ? 'List' : 'Grid'}
							</button>
						</div>
					</div>

					<!-- Metadata -->
					{#if inLibrary}
						<div class="panel-section">
							<h5 class="panel-label">Metadata</h5>
							{#if onlineMeta}
								<div class="panel-row">
									<span class="panel-text">Linked to {providerLabel}</span>
								</div>
								{#if onlineMeta.externalUrl}
									<a class="meta-link" href={onlineMeta.externalUrl} target="_blank" rel="noopener noreferrer">
										View on {providerLabel}
										<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
									</a>
								{/if}
								<div class="meta-actions">
									<button class="panel-action-btn" onclick={() => { showMetadataEditModal = true; showSettings = false; }}>
										Edit Metadata
									</button>
									<button class="panel-action-btn" onclick={handleMetadataFetch} disabled={metadataFetching}>
										{metadataFetching ? 'Refreshing...' : 'Refresh'}
									</button>
									<button class="panel-action-btn" onclick={() => { showMetadataModal = true; showSettings = false; }}>
										Change Link
									</button>
									<button class="meta-unlink-btn" onclick={handleMetadataUnlink}>Unlink</button>
								</div>
							{:else}
								<div class="meta-actions">
									<button class="panel-action-btn" onclick={handleMetadataFetch} disabled={metadataFetching}>
										{metadataFetching ? 'Fetching...' : 'Auto-Match'}
									</button>
									<button class="panel-action-btn" onclick={() => { showMetadataModal = true; showSettings = false; }}>
										Search & Link
									</button>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Actions -->
					<div class="panel-section panel-actions">
						<button class="panel-action-btn" onclick={() => { onRegenerateThumbnails(); showSettings = false; }}>
							Regen Thumbnails
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="top-badges">
		{#if work.status}
			<span class="badge text-xs {statusColors[work.status] ?? 'preset-tonal-surface'}">
				{statusLabels[work.status] ?? work.status}
			</span>
		{/if}
		{#if work.nsfw}
			<span class="badge text-xs preset-tonal-error">NSFW</span>
		{/if}
	</div>

	<div class="top-title">
		{#if work.logoUrl}
			<img src={work.logoUrl} alt={work.title} class="logo-title" />
		{:else}
			<h2 class="title-text">
				{#if work.iconUrl}
					<img src={work.iconUrl} alt="" class="icon-title" />
				{/if}
				{work.title}
			</h2>
		{/if}
	</div>
</div>

<style>

	.back-btn,
	:global(.continue-btn) {
		transition: background-color 0.2s ease, color 0.2s ease, filter 0.2s ease !important;
	}

	.back-btn {
		background-color: var(--color-surface-950) !important;
		color: var(--color-surface-50) !important;
	}

	.back-btn:hover {
		background-color: var(--color-surface-700) !important;
		color: var(--color-surface-50) !important;
	}

	:global(.continue-btn:hover) {
		filter: brightness(1.2);
	}

	/* ── Cogwheel ── */

	.settings-anchor {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
	}

	.cog-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 5px;
		background: none;
		color: inherit;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.cog-btn:hover {
		color: inherit;
		background: color-mix(in oklch, var(--layer-border) 30%, transparent);
	}

	.cog-btn.active {
		color: var(--color-primary-500);
		background: color-mix(in oklch, var(--layer-border) 40%, transparent);
	}

	.cog-btn:active { transform: scale(0.92); }

	/* ── Settings Panel ── */

	.settings-panel {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 6px;
		width: 280px;
		background: color-mix(in oklch, var(--layer-raised) 95%, transparent);
		backdrop-filter: blur(20px) saturate(150%);
		-webkit-backdrop-filter: blur(20px) saturate(150%);
		border: 1px solid var(--layer-border);
		border-radius: 8px;
		padding: 6px;
		z-index: 50;
		box-shadow: var(--shadow-overlay);
		animation: popIn 0.15s ease-out;
	}

	@keyframes popIn {
		from { opacity: 0; transform: translateY(-4px) scale(0.97); }
		to { opacity: 1; transform: translateY(0) scale(1); }
	}

	.panel-section {
		padding: 8px 10px;
	}

	.panel-section + .panel-section {
		border-top: 1px solid var(--layer-border-subtle);
	}

	.panel-label {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
		color: inherit;
		margin: 0 0 6px;
	}

	.panel-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 4px;
	}

	.panel-text {
		font-size: 0.8rem;
		color: inherit;
	}

	.panel-btn {
		font-size: 0.78rem;
		padding: 3px 8px;
		border: 1px solid color-mix(in oklch, var(--color-surface-300) 30%, transparent);
		border-radius: 4px;
		background: none;
		color: inherit;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.panel-btn:hover {
		border-color: var(--layer-border);
		background: color-mix(in oklch, var(--layer-border) 25%, transparent);
	}

	.sub-picker {
		margin: 4px 0 6px;
		padding: 2px;
		background: var(--layer-sunken);
		border-radius: 5px;
	}

	.picker-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 6px 10px;
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		border-radius: 4px;
		font-size: 0.8rem;
		text-align: left;
		transition: all var(--transition-fast);
	}

	.picker-item:hover { background: color-mix(in oklch, var(--color-surface-500) 8%, transparent); }

	.picker-item.active {
		background: var(--color-primary-500);
		color: #fff;
	}

	.picker-type {
		font-size: 0.65rem;
		text-transform: uppercase;
		color: inherit;
	}

	.picker-checkbox {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 10px;
		color: inherit;
		cursor: pointer;
		border-radius: 4px;
		font-size: 0.8rem;
	}

	.picker-checkbox:hover { background: rgba(128,128,128,0.12); }
	.picker-checkbox input[type="checkbox"] { accent-color: var(--color-primary-500); }

	.panel-action-btn {
		width: 100%;
		padding: 6px 10px;
		border: none;
		border-radius: 4px;
		background: color-mix(in oklch, var(--layer-border) 30%, transparent);
		color: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		text-align: center;
		transition: all var(--transition-fast);
	}

	.panel-action-btn:hover {
		background: color-mix(in oklch, var(--layer-border) 50%, transparent);
	}

	.panel-action-btn:active { transform: scale(0.98); }

	.remove-btn {
		width: 100%;
		padding: 6px 10px;
		margin-top: 6px;
		border: none;
		border-radius: 4px;
		background: color-mix(in oklch, var(--color-error-500) 10%, transparent);
		color: var(--color-error-500);
		font-size: 0.78rem;
		cursor: pointer;
		text-align: center;
		transition: all var(--transition-fast);
	}

	.remove-btn:hover {
		background: color-mix(in oklch, var(--color-error-500) 20%, transparent);
	}

	.remove-btn:active { transform: scale(0.98); }

	.panel-actions {
		padding-top: 6px;
		padding-bottom: 6px;
	}

	.meta-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.75rem;
		color: var(--color-primary-500) !important;
		text-decoration: none !important;
		margin-bottom: 6px;
	}

	.meta-link:hover {
		color: var(--color-primary-400) !important;
	}

	.meta-actions {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.meta-unlink-btn {
		width: 100%;
		padding: 4px 10px;
		border: none;
		border-radius: 4px;
		background: color-mix(in oklch, var(--color-error-500) 10%, transparent);
		color: var(--color-error-500);
		font-size: 0.75rem;
		cursor: pointer;
		text-align: center;
		transition: all var(--transition-fast);
	}

	.meta-unlink-btn:hover {
		background: color-mix(in oklch, var(--color-error-500) 20%, transparent);
	}

	/* ── Banner ── */

	.banner-bg {
		position: absolute;
		top: -5%;
		left: 0;
		right: 0;
		bottom: 0;
		overflow: hidden;
		z-index: -1;
		-webkit-mask-image: linear-gradient(to bottom, black 20%, transparent 95%);
		mask-image: linear-gradient(to bottom, black 20%, transparent 95%);
		pointer-events: none;
	}

	.banner-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center top;
		filter: blur(4px) saturate(125%);
		transform: scale(1.05);
		opacity: 0.25;
	}

	.banner-halftone {
		position: absolute;
		inset: 0;
		overflow: hidden;
		transform: translateZ(0);
		mix-blend-mode: color-burn;
		opacity: 0.15;
		filter: contrast(20);
	}

	.halftone-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center top;
		transform: scale(1.05);
		animation: halftone-filter 60s linear infinite alternate;
	}

	.banner-halftone::after {
		content: '';
		position: absolute;
		top: -100%;
		left: -100%;
		right: -100%;
		bottom: -100%;
		background: radial-gradient(5px 5px, white, black);
		background-size: 6px 6px;
		mix-blend-mode: color-dodge;
		pointer-events: none;
		z-index: 1;
		animation: halftone-overlay 60s linear infinite alternate;
	}

	@keyframes halftone-overlay {
		0% { transform: rotate(11.25deg); }
		100% { transform: rotate(13deg) scale(1.5); }
	}

	@keyframes halftone-filter {
		0% { filter: brightness(0.5) blur(6px); }
		100% { filter: brightness(0.5) blur(10px); }
	}

	/* ── Left-column header: back + title + badges ── */

	.detail-header {
		position: relative;
		margin-bottom: 0;
		padding-top: 50px;
	}

	.header-top-row {
		display: flex;
		align-items: center;
		gap: 8px;
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
	}

	.top-title {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 20px;
	}

	.title-text {
		font-size: 2rem;
		font-weight: 600;
		margin: 0;
	}

	.logo-title {
		max-height: 180px;
		max-width: 100%;
	}

	.icon-title {
		width: 22px;
		height: 22px;
		vertical-align: middle;
		margin-right: 4px;
		border-radius: 3px;
	}

	.top-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.mobile-title {
		margin-top: 4px;
	}

	/* ── Right sidebar: cover + content ── */

	.detail-sidebar {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
	}

	.detail-sidebar::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: -20px;
		right: -9999px;
		height: 70%;
		background: linear-gradient(to top, var(--body-background-color) 0%, transparent 100%);
		border-left: 1px solid transparent;
		border-image: linear-gradient(to top, var(--layer-border) 0%, transparent 100%) 1;
		pointer-events: none;
		z-index: -1;
		transition: height 0.4s ease, opacity 0.3s ease;
	}

	.detail-sidebar.pane-expanded::after {
		height: 90%;
	}

	:global(.dark) .detail-sidebar::after {
		background: linear-gradient(to top, var(--body-background-color-dark) 0%, transparent 100%);
	}

	/* ── Cover swap container ── */

	.cover-swap {
		position: relative;
		width: 95%;
		max-width: 280px;
		margin: 45px auto 10px;
	}

	/* Strip shadows from incoming cover — base provides the only shadow */
	.cover-incoming :global(.book-3d__inner::after) {
		box-shadow: none !important;
	}

	.cover-incoming :global(.book-3d__cover) {
		box-shadow: none !important;
	}

	.cover-incoming :global(.cover-image) {
		box-shadow: none !important;
	}

	.cover-incoming {
		position: absolute;
		top: -60px;
		left: -60px;
		width: calc(100% + 120px);
		padding: 60px;
		z-index: 1;
		pointer-events: none;
	}

	.cover-incoming :global(*) {
		pointer-events: auto;
	}

	/* ── Halftone wipe transition ── */

	@property --wipe {
		syntax: '<percentage>';
		inherits: true;
		initial-value: -60%;
	}

	.halftone-wipe {
		animation: halftone-wipe-in 1.1s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
	}

	@keyframes halftone-wipe-in {
		from { --wipe: -60%; }
		to { --wipe: 180%; }
	}

	.cover-incoming.halftone-wipe {
		/*
		 * Three-layer mask composited bottom→top:
		 *   Layer 3 (bottom): band gradient — defines the transition zone
		 *   Layer 2 (dots):   intersected with band → dots only in the zone
		 *   Layer 1 (top):    solid behind wipe — added on top → fills in solid region
		 */
		-webkit-mask-image:
			/* Layer 1: solid fill trailing behind — very long soft feather */
			linear-gradient(115deg, black calc(var(--wipe) - 45%), transparent calc(var(--wipe) + 20%)),
			/* Layer 2: 45°-rotated halftone dots via SVG pattern */
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Cdefs%3E%3Cpattern id='d' width='8' height='8' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'%3E%3Ccircle cx='4' cy='4' r='2' fill='black'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23d)'/%3E%3C/svg%3E"),
			/* Layer 3: sweep gradient for dots */
			linear-gradient(115deg, black calc(var(--wipe)), transparent calc(var(--wipe) + 50%));
		-webkit-mask-size: 100% 100%, 100% 100%, 100% 100%;
		-webkit-mask-composite: source-over, source-in;
		mask-image:
			linear-gradient(115deg, black calc(var(--wipe) - 45%), transparent calc(var(--wipe) + 20%)),
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Cdefs%3E%3Cpattern id='d' width='8' height='8' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'%3E%3Ccircle cx='4' cy='4' r='2' fill='black'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23d)'/%3E%3C/svg%3E"),
			linear-gradient(115deg, black calc(var(--wipe)), transparent calc(var(--wipe) + 50%));
		mask-size: 100% 100%, 100% 100%, 100% 100%;
		mask-composite: add, intersect;
	}

	/* ── Expand / collapse ── */

	.cover-section {
		padding: 20px 40px 10px 40px;
		margin: -20px -40px -10px -40px;
		transition: max-height 0.4s ease, opacity 0.4s ease, filter 0.4s ease, margin-top 0.4s ease;
		max-height: 600px;
	}

	.detail-sidebar.pane-expanded .cover-section {
		max-height: 0;
		opacity: 0;
		filter: blur(8px);
		margin-top: -20px;
		overflow: hidden;
	}

	/* ── Chapter navigation (above cover) ── */

	.chapter-nav {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		z-index: 10;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.3s ease;
	}

	.chapter-nav.visible {
		opacity: 1;
		pointer-events: auto;
	}

	.nav-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 4px;
		background: color-mix(in oklch, var(--layer-border) 30%, transparent);
		color: inherit;
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.nav-btn:hover:not(:disabled) {
		background: color-mix(in oklch, var(--layer-border) 60%, transparent);
		color: inherit;
	}

	.nav-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.nav-btn.close-btn:hover {
		background: color-mix(in oklch, var(--color-error-500) 20%, transparent);
		color: var(--color-error-500);
	}

	.nav-arrows {
		display: flex;
		gap: 4px;
	}

	.action-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
