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
		continueChapter: Chapter | null;
		titleReaderDirection: string | null;
		titleReaderOffset: string | null;
		titleCoverArtMode: string | null;
		directionOptions: { value: string; label: string }[];
		offsetOptions: { value: string; label: string }[];
		coverArtOptions: { value: string; label: string }[];
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
		continueChapter, titleReaderDirection, titleReaderOffset, titleCoverArtMode,
		directionOptions, offsetOptions, coverArtOptions,
		onAddClick, onRemove, onAddToLibrary, onToggleCollection,
		onReaderSettingChange, onRegenerateThumbnails,
	}: Props = $props();

	let showLibraryPicker = $state(false);
	let showCollectionPicker = $state(false);

	let currentLibraryName = $derived(userLibraries.find((l) => l.id === currentLibraryId)?.name ?? 'Unsorted');

	const statusLabels: Record<string, string> = {
		ongoing: 'Ongoing', completed: 'Completed', hiatus: 'Hiatus',
		cancelled: 'Cancelled', unknown: 'Unknown',
	};

	const statusColors: Record<string, string> = {
		ongoing: 'preset-tonal-success', completed: 'preset-tonal-secondary', hiatus: 'preset-tonal-warning',
		cancelled: 'preset-tonal-error', unknown: 'preset-tonal-surface',
	};

	// Cover image: posterUrl takes priority over coverUrl
	let coverImageUrl = $derived(work.posterUrl ?? work.coverUrl);
</script>

<div class="detail-header" class:has-banner={!!work.bannerUrl}>
	{#if work.bannerUrl}
		<div class="banner-bg">
			<img src={work.bannerUrl} alt="" class="banner-img" />
			<div class="banner-overlay"></div>
		</div>
	{/if}

	<div class="header-content">
		{#if coverImageUrl}
			<div class="detail-cover">
				<CoverImage url={coverImageUrl} {sourceId} {workId} alt={work.title} loading="eager" tilt />
			</div>
		{/if}
		<div class="detail-info">
			{#if work.logoUrl}
				<img src={work.logoUrl} alt={work.title} class="logo-title" />
			{:else}
				<h2 class="h4 mb-2">
					{#if work.iconUrl}
						<img src={work.iconUrl} alt="" class="icon-title" />
					{/if}
					{work.title}
				</h2>
			{/if}
			<div class="detail-meta">
				{#if source}
					<span class="source-badge">
						{#if source.iconUrl}
							<img src={source.iconUrl} alt="" class="source-badge-icon" />
						{/if}
						{source.name}
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
				{#if work.metadata?.publisher}
					<span class="badge text-xs preset-tonal-surface">{work.metadata.publisher}</span>
				{/if}
				{#if work.metadata?.year}
					<span class="badge text-xs preset-tonal-surface">{work.metadata.year}</span>
				{/if}
			</div>
			{#if work.author}
				<p class="author">{work.author}</p>
			{/if}
			{#if work.genres && work.genres.length > 0}
				<div class="genre-tags">
					{#each work.genres as genre}
						<span class="badge text-xs bg-surface-200-800">{genre}</span>
					{/each}
				</div>
			{/if}
			{#if work.description}
				<p class="description">{work.description}</p>
			{/if}
			<div class="action-buttons">
				<div class="library-actions">
					{#if inLibrary}
						<button class="btn btn-sm preset-filled-error-500" onclick={onRemove}>
							Remove
						</button>
						{#if userLibraries.length > 0}
							<button class="btn btn-sm preset-tonal-surface" onclick={() => showLibraryPicker = !showLibraryPicker}>
								{currentLibraryName} &#9662;
							</button>
						{/if}
					{:else}
						<button class="btn btn-sm preset-filled-primary-500" onclick={onAddClick}>
							Add to Library
						</button>
					{/if}

					{#if showLibraryPicker}
						<div class="library-picker">
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
					{#if inLibrary && allCollections.length > 0}
						<button class="btn btn-sm preset-tonal-surface" onclick={() => showCollectionPicker = !showCollectionPicker}>
							{titleCollectionIds.size > 0 ? `${titleCollectionIds.size} collection${titleCollectionIds.size > 1 ? 's' : ''}` : 'Collections'} &#9662;
						</button>
						{#if showCollectionPicker}
							<div class="library-picker">
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
				</div>
				{#if continueChapter}
					<a
						href="/work/{sourceId}/{encodeURIComponent(workId)}/{encodeURIComponent(continueChapter.id)}"
						class="btn btn-sm preset-filled-success-500"
					>
						Continue Reading &middot; {continueChapter.title}
					</a>
				{/if}
			</div>
			{#if inLibrary}
				<div class="reader-overrides">
					<ReaderOverrides
						direction={titleReaderDirection ?? ''}
						offset={titleReaderOffset ?? ''}
						coverArtMode={titleCoverArtMode ?? ''}
						{directionOptions}
						{offsetOptions}
						{coverArtOptions}
						onchange={(field, value) => onReaderSettingChange(field, value)}
					/>
					<button class="regen-btn" onclick={onRegenerateThumbnails}>
						Regen Thumbs
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.detail-header {
		position: relative;
		margin-bottom: 24px;
	}

	.detail-header.has-banner {
		padding-top: 0;
	}

	.banner-bg {
		position: absolute;
		top: -20px;
		left: -20px;
		right: -20px;
		height: 280px;
		overflow: hidden;
		z-index: 0;
	}

	.banner-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		filter: blur(2px);
	}

	.banner-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to bottom,
			rgba(var(--color-surface-50), 0.3) 0%,
			rgba(var(--color-surface-50), 0.85) 60%,
			rgb(var(--color-surface-50)) 100%
		);
	}

	:global(.dark) .banner-overlay {
		background: linear-gradient(
			to bottom,
			rgba(var(--color-surface-950), 0.3) 0%,
			rgba(var(--color-surface-950), 0.85) 60%,
			rgb(var(--color-surface-950)) 100%
		);
	}

	.header-content {
		position: relative;
		display: flex;
		gap: 24px;
		z-index: 1;
	}

	.has-banner .header-content {
		padding-top: 120px;
	}

	.detail-cover {
		width: 180px;
		flex-shrink: 0;
	}

	.detail-info { flex: 1; min-width: 0; }

	.logo-title {
		max-height: 60px;
		max-width: 300px;
		margin-bottom: 8px;
	}

	.icon-title {
		width: 24px;
		height: 24px;
		vertical-align: middle;
		margin-right: 6px;
		border-radius: 4px;
	}

	.detail-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-bottom: 6px;
	}

	.source-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.8rem;
		color: rgb(var(--color-surface-500));
		background: rgb(var(--color-surface-200));
		padding: 2px 8px;
		border-radius: 4px;
	}

	:global(.dark) .source-badge {
		background: rgb(var(--color-surface-800));
	}

	.source-badge-icon {
		width: 14px;
		height: 14px;
		border-radius: 3px;
	}

	.author {
		font-size: 0.9rem;
		color: rgb(var(--color-surface-500));
		margin-bottom: 6px;
	}

	.genre-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 8px;
	}

	.description {
		margin-top: 8px;
		color: rgb(var(--color-surface-500));
		font-size: 0.85rem;
		line-height: 1.5;
		max-height: 120px;
		overflow-y: auto;
	}

	.library-actions {
		position: relative;
		display: flex;
		gap: 6px;
	}

	.library-picker {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		background: rgb(var(--color-surface-200));
		border: 1px solid rgb(var(--color-surface-300));
		border-radius: 6px;
		padding: 4px;
		min-width: 180px;
		z-index: 20;
		box-shadow: 0 4px 12px rgba(0,0,0,0.15);
	}

	:global(.dark) .library-picker {
		background: rgb(var(--color-surface-800));
		border-color: rgb(var(--color-surface-600));
		box-shadow: 0 4px 12px rgba(0,0,0,0.4);
	}

	.picker-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 8px 12px;
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		border-radius: 4px;
		font-size: 0.85rem;
		text-align: left;
	}

	.picker-item:hover { background: rgba(128,128,128,0.15); }
	.picker-item.active { background: rgb(var(--color-primary-500)); color: #fff; }

	.picker-type {
		font-size: 0.7rem;
		text-transform: uppercase;
		opacity: 0.6;
	}

	.picker-checkbox {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 12px;
		color: inherit;
		cursor: pointer;
		border-radius: 4px;
		font-size: 0.85rem;
	}

	.picker-checkbox:hover { background: rgba(128,128,128,0.15); }
	.picker-checkbox input[type="checkbox"] { accent-color: rgb(var(--color-primary-500)); }

	.action-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
	}

	.reader-overrides {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}

	.regen-btn {
		padding: 4px 10px;
		border: 1px solid rgb(var(--color-surface-200) / 0.1);
		border-radius: 4px;
		background: none;
		color: rgb(var(--color-surface-500));
		font-size: 0.75rem;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}

	.regen-btn:hover { color: rgb(var(--color-surface-800)); border-color: rgb(var(--color-surface-400)); }
	:global(.dark) .regen-btn:hover { color: rgb(var(--color-surface-200)); border-color: rgb(var(--color-surface-600)); }

	@media (max-width: 600px) {
		.header-content { flex-direction: column; align-items: center; text-align: center; }
		.detail-cover { width: 140px; }
		.genre-tags { justify-content: center; }
		.action-buttons { justify-content: center; }
	}
</style>
