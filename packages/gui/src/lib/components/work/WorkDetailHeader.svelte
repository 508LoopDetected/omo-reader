<script lang="ts">
	import CoverImage from '$lib/components/CoverImage.svelte';
	import ReaderOverrides from '$lib/components/ReaderOverrides.svelte';
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
		onback: () => void;
		onAddClick: () => void;
		onRemove: () => void;
		onAddToLibrary: (libraryId?: string) => void;
		onToggleCollection: (collectionId: string) => void;
		onReaderSettingChange: (field: 'direction' | 'offset' | 'coverArtMode', value: string | null) => void;
		onRegenerateThumbnails: () => void;
	}

	let {
		work, sourceId, workId, source, chapters, inLibrary,
		currentLibraryId, userLibraries, allCollections, titleCollectionIds,
		titleReaderDirection, titleReaderOffset, titleCoverArtMode,
		directionOptions, offsetOptions, coverArtOptions,
		onback, onAddClick, onRemove, onAddToLibrary, onToggleCollection,
		onReaderSettingChange, onRegenerateThumbnails,
	}: Props = $props();

	let showSettings = $state(false);
	let showLibraryPicker = $state(false);
	let showCollectionPicker = $state(false);
	let bannerEl = $state<HTMLDivElement>();

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

	let coverImageUrl = $derived(work.posterUrl ?? work.coverUrl);

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

<!-- Left column: back + cover + metadata -->
<div class="detail-sidebar">
	<button class="back-btn" onclick={onback}>
		<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
		Back
	</button>

	<div class="detail-cover">
		<CoverImage url={coverImageUrl} {sourceId} {workId} alt={work.title} loading="eager" tilt fallbackChar={work.title.charAt(0)} />
	</div>

	<!-- Mobile-only title -->
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

	{#if work.metadata?.publisher || work.metadata?.year}
		<div class="sidebar-meta">
			{#if work.metadata?.publisher}
				<span class="meta-item">{work.metadata.publisher}</span>
			{/if}
			{#if work.metadata?.year}
				<span class="meta-item">{work.metadata.year}</span>
			{/if}
		</div>
	{/if}

	{#if work.author}
		<p class="author">{work.author}</p>
	{/if}

	{#if work.genres && work.genres.length > 0}
		<div class="genre-tags">
			{#each work.genres as genre}
				<span class="badge text-xs preset-glass-surface">{genre}</span>
			{/each}
		</div>
	{/if}

</div>

<!-- Right column header: title + badges + settings (hidden on mobile) -->
<div class="detail-header hidden md:block" class:has-banner={!!work.bannerUrl}>
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

					<!-- Actions -->
					<div class="panel-section panel-actions">
						<button class="panel-action-btn" onclick={() => { onRegenerateThumbnails(); showSettings = false; }}>
							Regen Thumbnails
						</button>
					</div>
				</div>
			{/if}
		<div class="top-badges">
			{#if source}
				<span class="source-badge">
					{#if source.iconUrl}
						<img src={source.iconUrl} alt="" class="source-badge-icon" />
					{:else}
						<svg class="source-badge-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/></svg>
					{/if}
					{source.name.includes('/') ? source.name.split('/').filter(Boolean).pop() : source.name}
				</span>
			{/if}
			{#if work.status}
				<span class="badge text-xs {statusColors[work.status] ?? 'preset-tonal-surface'}">
					{statusLabels[work.status] ?? work.status}
				</span>
			{/if}
			{#if work.nsfw}
				<span class="badge text-xs preset-tonal-error">NSFW</span>
			{/if}
		</div>
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

	.back-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: none;
		color: rgb(var(--color-surface-400));
		cursor: pointer;
		padding: 6px 8px;
		margin: 10px 0 4px -6px;
		font-size: 0.82rem;
		border-radius: 6px;
		transition: all var(--transition-fast);
	}

	.has-banner .back-btn {
		color: rgba(255, 255, 255, 0.7);
	}

	.has-banner .back-btn:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
	}

	.back-btn:hover {
		color: inherit;
		background: color-mix(in oklch, var(--layer-border) 30%, transparent);
	}

	.back-btn:active { transform: scale(0.97); }

	/* ── Cogwheel ── */

	.settings-anchor {
		position: absolute;
		top: 0;
		right: 0;
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
		border-radius: 8px;
		background: none;
		color: rgb(var(--color-surface-400));
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.cog-btn:hover {
		color: inherit;
		background: color-mix(in oklch, var(--layer-border) 30%, transparent);
	}

	.cog-btn.active {
		color: rgb(var(--color-primary-500));
		background: color-mix(in oklch, var(--layer-border) 40%, transparent);
	}

	.has-banner .cog-btn {
		color: rgba(255, 255, 255, 0.7);
	}

	.has-banner .cog-btn:hover,
	.has-banner .cog-btn.active {
		color: #fff;
		background: rgba(255, 255, 255, 0.12);
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
		border-radius: 12px;
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
		color: rgb(var(--color-surface-400));
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
		color: rgb(var(--color-surface-500));
	}

	.panel-btn {
		font-size: 0.78rem;
		padding: 3px 8px;
		border: 1px solid rgb(var(--color-surface-300) / 0.3);
		border-radius: 6px;
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
		border-radius: 8px;
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
		border-radius: 6px;
		font-size: 0.8rem;
		text-align: left;
		transition: all var(--transition-fast);
	}

	.picker-item:hover { background: rgb(var(--color-surface-500) / 0.08); }

	.picker-item.active {
		background: rgb(var(--color-primary-500));
		color: #fff;
	}

	.picker-type {
		font-size: 0.65rem;
		text-transform: uppercase;
		opacity: 0.6;
	}

	.picker-checkbox {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 10px;
		color: inherit;
		cursor: pointer;
		border-radius: 6px;
		font-size: 0.8rem;
	}

	.picker-checkbox:hover { background: rgba(128,128,128,0.12); }
	.picker-checkbox input[type="checkbox"] { accent-color: rgb(var(--color-primary-500)); }

	.panel-action-btn {
		width: 100%;
		padding: 6px 10px;
		border: none;
		border-radius: 6px;
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
		border-radius: 6px;
		background: rgb(var(--color-error-500) / 0.1);
		color: rgb(var(--color-error-500));
		font-size: 0.78rem;
		cursor: pointer;
		text-align: center;
		transition: all var(--transition-fast);
	}

	.remove-btn:hover {
		background: rgb(var(--color-error-500) / 0.2);
	}

	.remove-btn:active { transform: scale(0.98); }

	.panel-actions {
		padding-top: 6px;
		padding-bottom: 6px;
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
		-webkit-mask-image: linear-gradient(to bottom, black 40%, transparent 95%);
		mask-image: linear-gradient(to bottom, black 40%, transparent 95%);
		pointer-events: none;
	}

	.banner-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center top;
		filter: blur(3px) saturate(125%);
		transform: scale(1.05);
		opacity: 0.15;
	}

	.banner-halftone {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		overflow: hidden;
		transform: translateZ(0);
		mix-blend-mode: color-burn;
		opacity: 0.05;
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

	/* ── Right-column header: title + badges + cog ── */

	.detail-header {
		position: relative;
		margin-bottom: 0;
		padding-top: 50px;
	}

	.top-title {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
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
		border-radius: 4px;
	}

	.top-badges {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 6px;
	}

	.source-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.78rem;
		color: rgb(var(--color-surface-500));
		background: var(--layer-sunken);
		padding: 2px 8px;
		border-radius: 4px;
	}

	.source-badge-icon {
		width: 14px;
		height: 14px;
		border-radius: 3px;
	}

	.mobile-title {
		margin-top: 4px;
	}

	/* ── Left sidebar: back + cover + metadata ── */

	.detail-sidebar {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		height: calc(100vh - var(--header-height, 48px) - 56px);
	}

	.detail-cover {
		width: 100%;
		margin-bottom: 4px;
	}

	.sidebar-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
	}

	.meta-item {
		font-size: 0.78rem;
		color: rgb(var(--color-surface-500));
	}

	.author {
		font-size: 0.88rem;
		color: rgb(var(--color-surface-500));
		margin: 0;
	}

	.genre-tags {
		flex: 1;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-content: flex-start;
		overflow-y: auto;
		min-height: 0;
		-webkit-mask-image: linear-gradient(to bottom, black 85%, transparent 100%);
		mask-image: linear-gradient(to bottom, black 85%, transparent 100%);
	}

	.description {
		padding: 10px 12px;
		color: rgb(var(--color-surface-500));
		font-size: 0.82rem;
		line-height: 1.6;
		max-height: 200px;
		overflow-y: auto;
		background: color-mix(in oklch, var(--layer-sunken) 40%, transparent);
		border-radius: 8px;
		border: 1px solid color-mix(in oklch, var(--layer-border) 30%, transparent);
		-webkit-mask-image: linear-gradient(to bottom, black 85%, transparent 100%);
		mask-image: linear-gradient(to bottom, black 85%, transparent 100%);
		margin: 0;
	}

	.action-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
