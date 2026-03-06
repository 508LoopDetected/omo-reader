<script lang="ts">
	import { goto, onNavigate } from '$lib/router.js';
	import CoverImage from '$lib/components/CoverImage.svelte';
	import type { WorkEntry, Chapter, Source, UserLibrary, Collection, ViewDef, SettingDef } from '@omo/core';

	interface Alternative {
		source: Source;
		work: WorkEntry;
		chapterCount: number;
	}

	let { params, searchParams }: { params: Record<string, string>; searchParams: URLSearchParams } = $props();
	let sourceId = $derived(params.sourceId ?? '');
	let workId = $derived(params.workId ?? '');

	// Track the page the user came from, ignoring returns from the chapter reader.
	// Persisted in sessionStorage so it survives component re-mounts (e.g. returning from reader).
	let backKey = $derived(`backUrl:${sourceId}:${workId}`);
	let backUrl = $state(
		sessionStorage.getItem(`backUrl:${params.sourceId}:${params.workId}`) ?? '/library'
	);
	$effect(() => {
		return onNavigate(({ from }) => {
			if (!from) return;
			const detailPath = `/work/${sourceId}/${encodeURIComponent(workId)}`;
			// If coming from a child route (reader), keep the existing backUrl
			if (from.pathname.startsWith(detailPath + '/')) return;
			// Otherwise update to where we actually came from
			backUrl = from.pathname + from.search;
			sessionStorage.setItem(backKey, backUrl);
		});
	});

	let work: WorkEntry | null = $state(null);
	let chapters: Chapter[] = $state([]);
	let source: Source | null = $state(null);
	let loading = $state(true);
	let inLibrary = $state(false);
	let chapterSort = $state<'desc' | 'asc'>('desc');
	let chapterViewExplicit = $state<'list' | 'grid' | null>(null);
	let alternatives = $state<Alternative[]>([]);
	let loadingAlternatives = $state(false);
	let userLibraries = $state<UserLibrary[]>([]);
	let showLibraryPicker = $state(false);
	let currentLibraryId = $state<string | null>(null);
	let currentLibraryName = $derived(userLibraries.find(l => l.id === currentLibraryId)?.name ?? 'Unsorted');
	let allCollections = $state<Collection[]>([]);
	let titleCollectionIds = $state<Set<string>>(new Set());
	let showCollectionPicker = $state(false);

	// Derive the effective library type for this work
	let currentLibraryType = $derived(
		userLibraries.find(l => l.id === currentLibraryId)?.type ?? null
	);
	let chapterView = $derived(
		chapterViewExplicit
		?? (typeof window !== 'undefined' ? localStorage.getItem('chapterView') as 'list' | 'grid' | null : null)
		?? (currentLibraryType === 'western' ? 'grid' : 'list')
	);

	function setChapterView(view: 'list' | 'grid') {
		chapterViewExplicit = view;
		localStorage.setItem('chapterView', view);
	}

	// Title-level reader settings overrides
	let titleReaderDirection = $state<string | null>(null);
	let titleReaderOffset = $state<string | null>(null);
	let titleCoverArtMode = $state<string | null>(null);

	let isLocalOrSmb = $derived(sourceId.startsWith('local:') || sourceId.startsWith('smb:'));
	let hasAnyCoverUrl = $derived(chapters.some((c) => c.coverUrl));

	// Manifest-driven reader override options
	let readerOverrideSettings = $state<SettingDef[]>([]);
	let directionOptions = $derived(readerOverrideSettings.find(s => s.key === 'reader.direction')?.options ?? [
		{ value: 'rtl', label: 'RTL' },
		{ value: 'ltr', label: 'LTR' },
	]);
	let offsetOptions = $derived(readerOverrideSettings.find(s => s.key === 'reader.offset')?.options ?? [
		{ value: 'true', label: 'Offset: On' },
		{ value: 'false', label: 'Offset: Off' },
	]);
	let coverArtOptions = $derived(readerOverrideSettings.find(s => s.key === 'cover.artMode')?.options ?? [
		{ value: 'none', label: 'Cover: None' },
		{ value: 'auto', label: 'Cover: Page 1' },
		{ value: 'offset', label: 'Cover: Page 2' },
		{ value: 'offset2', label: 'Cover: Page 3' },
	]);

	// Reading progress per chapter
	let progressMap = $state(new Map<string, { page: number; totalPages: number }>());

	let sortedChapters = $derived(
		[...chapters].sort((a, b) => {
			const numA = a.chapterNumber ?? 0;
			const numB = b.chapterNumber ?? 0;
			return chapterSort === 'desc' ? numB - numA : numA - numB;
		})
	);

	// Find the best "continue reading" chapter
	let continueChapter = $derived.by(() => {
		// Find first chapter that's started but not finished
		for (const ch of sortedChapters) {
			const prog = progressMap.get(ch.id);
			if (prog && prog.page > 0 && prog.page < prog.totalPages - 1) {
				return ch;
			}
		}
		// Find first unread chapter (in ascending order)
		const ascending = [...chapters].sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
		for (const ch of ascending) {
			const prog = progressMap.get(ch.id);
			if (!prog || prog.page === 0) {
				return ch;
			}
		}
		return null;
	});

	function isRead(chapterId: string): boolean {
		const prog = progressMap.get(chapterId);
		if (!prog) return false;
		// READ_THRESHOLD = 2 (from core/reading.ts)
		return prog.totalPages > 0 && prog.page >= prog.totalPages - 2;
	}

	function isInProgress(chapterId: string): boolean {
		const prog = progressMap.get(chapterId);
		if (!prog) return false;
		return prog.page > 0 && !isRead(chapterId);
	}

	let readCount = $derived(chapters.filter((c) => isRead(c.id)).length);

	async function loadDetail() {
		loading = true;
		try {
			const urlTitle = searchParams.get('title');
			const titleParam = urlTitle ? `&title=${encodeURIComponent(urlTitle)}` : '';
			const res = await fetch(
				`/api/sources/${sourceId}/work?id=${encodeURIComponent(workId)}${titleParam}&composite=true`,
			);

			if (res.ok) {
				const data = await res.json();
				work = data.work;
				chapters = data.chapters;
				source = data.source ?? null;
				inLibrary = data.inLibrary;
				currentLibraryId = data.libraryId;
				userLibraries = data.userLibraries;
				allCollections = data.collections;
				titleCollectionIds = new Set(data.titleCollectionIds);
				titleReaderDirection = data.readerSettings.direction;
				titleReaderOffset = data.readerSettings.offset;
				titleCoverArtMode = data.readerSettings.coverArtMode;

				// Convert progressMap from Record to Map
				const map = new Map<string, { page: number; totalPages: number }>();
				for (const [chId, prog] of Object.entries(data.progressMap)) {
					map.set(chId, prog as { page: number; totalPages: number });
				}
				progressMap = map;
			}
			// Load manifest for reader override options (one-time)
			if (readerOverrideSettings.length === 0) {
				try {
					const mRes = await fetch('/api/manifest');
					if (mRes.ok) {
						const manifest = await mRes.json();
						const allSettings: SettingDef[] = [];
						for (const cat of manifest.settings.categories) {
							for (const s of cat.settings) {
								if (s.scopes?.includes('title')) allSettings.push(s);
							}
						}
						readerOverrideSettings = allSettings;
					}
				} catch { /* ignore */ }
			}
		} catch (err) {
			console.error('Failed to load work detail:', err);
		} finally {
			loading = false;
			loadAlternatives();
		}
	}

	async function regenerateThumbnails() {
		await fetch(`/api/cache/thumbnails?sourceId=${encodeURIComponent(sourceId)}&workId=${encodeURIComponent(workId)}`, {
			method: 'DELETE',
		});
		window.location.reload();
	}

	async function loadAlternatives() {
		if (!work || chapters.length > 0) return;
		loadingAlternatives = true;
		try {
			const res = await fetch(
				`/api/sources/${sourceId}/alternatives?title=${encodeURIComponent(work.title)}`
			);
			if (res.ok) {
				const data = await res.json();
				alternatives = data.alternatives;
			}
		} catch (err) {
			console.error('Failed to load alternatives:', err);
		} finally {
			loadingAlternatives = false;
		}
	}

	async function saveTitleReaderSetting(field: 'direction' | 'offset', value: string | null) {
		try {
			const body: Record<string, unknown> = { sourceId, workId };
			body[field] = value;
			await fetch('/api/reader-settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (field === 'direction') titleReaderDirection = value;
			else titleReaderOffset = value;
		} catch (err) {
			console.error('Failed to save reader setting:', err);
		}
	}

	async function saveCoverArtMode(value: string | null) {
		titleCoverArtMode = value;
		try {
			await fetch('/api/reader-settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sourceId, workId, coverArtMode: value }),
			});
			// Reload detail to get new cover URLs from server
			loadDetail();
		} catch (err) {
			console.error('Failed to save cover art mode:', err);
		}
	}

	async function loadCollections() {
		try {
			const [colsRes, itemColsRes] = await Promise.all([
				fetch('/api/collections'),
				inLibrary
					? fetch(`/api/collections/items?sourceId=${sourceId}&workId=${encodeURIComponent(workId)}`)
					: Promise.resolve(null),
			]);
			if (colsRes.ok) allCollections = await colsRes.json();
			if (itemColsRes?.ok) {
				const ids: string[] = await itemColsRes.json();
				titleCollectionIds = new Set(ids);
			} else {
				titleCollectionIds = new Set();
			}
		} catch {
			allCollections = [];
			titleCollectionIds = new Set();
		}
	}


	async function toggleCollection(collectionId: string) {
		const has = titleCollectionIds.has(collectionId);
		// Optimistic update
		const next = new Set(titleCollectionIds);
		if (has) next.delete(collectionId);
		else next.add(collectionId);
		titleCollectionIds = next;

		try {
			if (has) {
				await fetch(`/api/collections/items?collectionId=${collectionId}&sourceId=${sourceId}&workId=${encodeURIComponent(workId)}`, {
					method: 'DELETE',
				});
			} else {
				await fetch('/api/collections/items', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ collectionId, sourceId, workId }),
				});
			}
		} catch (err) {
			console.error('Failed to toggle collection:', err);
			// Revert
			if (has) next.add(collectionId);
			else next.delete(collectionId);
			titleCollectionIds = new Set(next);
		}
	}

	async function removeFromLibrary() {
		if (!work) return;
		await fetch(`/api/library?sourceId=${sourceId}&workId=${workId}`, { method: 'DELETE' });
		inLibrary = false;
		currentLibraryId = null;
		titleCollectionIds = new Set();
		titleReaderDirection = null;
		titleReaderOffset = null;
		titleCoverArtMode = null;
		showLibraryPicker = false;
		showCollectionPicker = false;
	}

	async function addToLibrary(libraryId?: string) {
		if (!work) return;
		if (inLibrary) {
			// Move to different library
			await fetch('/api/library/move', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sourceId, workId, libraryId: libraryId ?? null }),
			});
			currentLibraryId = libraryId ?? null;
		} else {
			await fetch('/api/library', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sourceId, workId, title: work.title, coverUrl: work.coverUrl,
					url: work.url, author: work.author, description: work.description,
					genres: work.genres, status: work.status, nsfw: work.nsfw ?? false,
					libraryId: libraryId ?? null,
				}),
			});
			inLibrary = true;
			currentLibraryId = libraryId ?? null;
		}
		showLibraryPicker = false;
		await loadCollections();
	}

	function handleAddClick() {
		if (userLibraries.length === 0) {
			addToLibrary();
		} else {
			showLibraryPicker = !showLibraryPicker;
		}
	}

	async function markChapter(chapter: Chapter, read: boolean, evt: MouseEvent) {
		evt.preventDefault();
		evt.stopPropagation();
		await fetch('/api/progress/mark', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sourceId, workId, chapterId: chapter.id, read }),
		});
		// Update local state immediately
		const newMap = new Map(progressMap);
		if (read) {
			const existing = newMap.get(chapter.id);
			const totalPages = existing?.totalPages || chapter.pageCount || 1;
			newMap.set(chapter.id, { page: Math.max(totalPages - 1, 0), totalPages });
		} else {
			newMap.delete(chapter.id);
		}
		progressMap = newMap;
	}

	const statusLabels: Record<string, string> = {
		ongoing: 'Ongoing', completed: 'Completed', hiatus: 'Hiatus',
		cancelled: 'Cancelled', unknown: 'Unknown',
	};

	const statusColors: Record<string, string> = {
		ongoing: 'is-success', completed: 'is-info', hiatus: 'is-warning',
		cancelled: 'is-danger', unknown: 'is-light',
	};

	$effect(() => {
		void sourceId;
		void workId;
		loadDetail();
	});
</script>

{#if loading}
	<div class="has-text-centered py-6">
		<div class="loader-inline"></div>
	</div>
{:else if work}
	<div class="work-detail">
		<button class="back-btn" onclick={() => goto(backUrl)}>
			<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
			Back
		</button>
		<div class="detail-header">
			{#if work.coverUrl}
				<div class="detail-cover">
					<CoverImage url={work.coverUrl} {sourceId} {workId} alt={work.title} loading="eager" tilt />
				</div>
			{/if}
			<div class="detail-info">
				<h2 class="title is-4 mb-2">{work.title}</h2>
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
						<span class="tag is-small {statusColors[work.status] ?? 'is-light'}">
							{statusLabels[work.status] ?? work.status}
						</span>
					{/if}
					{#if work.nsfw}
						<span class="tag is-small is-danger">NSFW</span>
					{/if}
				</div>
				{#if work.author}
					<p class="author">{work.author}</p>
				{/if}
				{#if work.genres && work.genres.length > 0}
					<div class="genre-tags">
						{#each work.genres as genre}
							<span class="tag is-small is-dark">{genre}</span>
						{/each}
					</div>
				{/if}
				{#if work.description}
					<p class="description">{work.description}</p>
				{/if}
				<div class="action-buttons">
					<div class="library-actions">
						{#if inLibrary}
							<button class="button is-small is-danger" onclick={removeFromLibrary}>
								Remove
							</button>
							{#if userLibraries.length > 0}
								<button class="button is-small" onclick={() => showLibraryPicker = !showLibraryPicker}>
									{currentLibraryName} &#9662;
								</button>
							{/if}
						{:else}
							<button class="button is-small is-primary" onclick={handleAddClick}>
								Add to Library
							</button>
						{/if}

						{#if showLibraryPicker}
							<div class="library-picker">
								<button class="picker-item" class:active={!currentLibraryId && inLibrary} onclick={() => addToLibrary()}>
									Unsorted
								</button>
								{#each userLibraries as lib}
									<button class="picker-item" class:active={currentLibraryId === lib.id} onclick={() => addToLibrary(lib.id)}>
										{lib.name}
										<span class="picker-type">{lib.type}</span>
									</button>
								{/each}
							</div>
						{/if}
						{#if inLibrary && allCollections.length > 0}
							<button class="button is-small" onclick={() => showCollectionPicker = !showCollectionPicker}>
								{titleCollectionIds.size > 0 ? `${titleCollectionIds.size} collection${titleCollectionIds.size > 1 ? 's' : ''}` : 'Collections'} &#9662;
							</button>
							{#if showCollectionPicker}
								<div class="library-picker">
									{#each allCollections as col}
										<label class="picker-checkbox">
											<input
												type="checkbox"
												checked={titleCollectionIds.has(col.id)}
												onchange={() => toggleCollection(col.id)}
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
							class="button is-small is-success"
						>
							Continue Reading &middot; {continueChapter.title}
						</a>
					{/if}
				</div>
				{#if inLibrary}
					<div class="reader-overrides">
						<span class="override-label">Reader:</span>
						<div class="select is-small">
							<select
								value={titleReaderDirection ?? ''}
								onchange={(e) => {
									const v = (e.target as HTMLSelectElement).value;
									saveTitleReaderSetting('direction', v || null);
								}}
							>
								<option value="">Auto</option>
								{#each directionOptions as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
						<div class="select is-small">
							<select
								value={titleReaderOffset ?? ''}
								onchange={(e) => {
									const v = (e.target as HTMLSelectElement).value;
									saveTitleReaderSetting('offset', v || null);
								}}
							>
								<option value="">Offset: Auto</option>
								{#each offsetOptions as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
						<div class="select is-small">
							<select
								value={titleCoverArtMode ?? ''}
								onchange={(e) => {
									const v = (e.target as HTMLSelectElement).value;
									saveCoverArtMode(v || null);
								}}
							>
								<option value="">Cover: Auto</option>
								{#each coverArtOptions as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
					<button class="regen-btn" onclick={regenerateThumbnails}>
						Regen Thumbs
					</button>
					</div>
				{/if}
			</div>
		</div>

		<div class="chapter-header">
			<h3 class="title is-5 mb-0">Chapters ({chapters.length})</h3>
			<span class="read-count">{readCount} read</span>
			<button class="sort-btn" onclick={() => chapterSort = chapterSort === 'desc' ? 'asc' : 'desc'}>
				{chapterSort === 'desc' ? 'Newest first' : 'Oldest first'}
				<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
					{#if chapterSort === 'desc'}
						<path d="M7 10l5 5 5-5z"/>
					{:else}
						<path d="M7 14l5-5 5 5z"/>
					{/if}
				</svg>
			</button>
			<button
				class="view-toggle-btn"
				title={chapterView === 'list' ? 'Grid view' : 'List view'}
				onclick={() => setChapterView(chapterView === 'list' ? 'grid' : 'list')}
			>
				{#if chapterView === 'list'}
					<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 3h8v8H3zm0 10h8v8H3zm10-10h8v8h-8zm0 10h8v8h-8z"/></svg>
				{:else}
					<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
				{/if}
			</button>
		</div>

		{#if chapters.length === 0 && !loading}
			<div class="alternatives-section">
				{#if loadingAlternatives}
					<div class="alt-loading">
						<div class="loader-inline"></div>
						<p class="alt-loading-text">Searching other sources...</p>
					</div>
				{:else if alternatives.length > 0}
					<h4 class="alt-title">Also available on</h4>
					<div class="alt-list">
						{#each alternatives as alt}
							<a
								href="/work/{alt.source.id}/{encodeURIComponent(alt.work.id)}?title={encodeURIComponent(alt.work.title)}"
								class="alt-item"
							>
								{#if alt.source.iconUrl}
									<img src={alt.source.iconUrl} alt="" class="alt-icon" />
								{/if}
								<span class="alt-source-name">{alt.source.name}</span>
								<span class="alt-chapters">{alt.chapterCount} chapter{alt.chapterCount !== 1 ? 's' : ''}</span>
								<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="alt-arrow"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
							</a>
						{/each}
					</div>
				{:else if !loadingAlternatives}
					<p class="no-chapters-msg">No chapters available from any source.</p>
				{/if}
			</div>
		{/if}

		{#if chapterView === 'grid'}
			<div class="chapter-grid">
				{#each sortedChapters as chapter}
					<a
						href="/work/{sourceId}/{encodeURIComponent(workId)}/{encodeURIComponent(chapter.id)}"
						class="grid-card"
						class:is-read={isRead(chapter.id)}
						data-tilt-hover
					>
						<CoverImage url={chapter.coverUrl} {sourceId} {workId} alt={chapter.title} fallbackChar={chapter.title.charAt(0)}>
							{#snippet overlay()}
								{#if isRead(chapter.id)}
									<div class="grid-badge read-badge">
										<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
									</div>
								{:else if isInProgress(chapter.id)}
									{@const prog = progressMap.get(chapter.id)}
									<div class="grid-badge progress-badge">
										{#if prog}p.{prog.page + 1}/{prog.totalPages}{/if}
									</div>
								{/if}
							{/snippet}
						</CoverImage>
						<div class="grid-title">{chapter.title}</div>
					</a>
				{/each}
			</div>
		{:else}
			<div class="chapter-list">
				{#each sortedChapters as chapter}
					<div class="chapter-row" class:is-read={isRead(chapter.id)}>
						<a
							href="/work/{sourceId}/{encodeURIComponent(workId)}/{encodeURIComponent(chapter.id)}"
							class="chapter-item"
						>
							<div class="chapter-left">
								{#if isRead(chapter.id)}
									<svg class="read-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
								{:else if isInProgress(chapter.id)}
									<div class="progress-dot"></div>
								{/if}
								<div class="chapter-title">{chapter.title}</div>
							</div>
							<div class="chapter-right">
								{#if isInProgress(chapter.id)}
									{@const prog = progressMap.get(chapter.id)}
									{#if prog}
										<span class="chapter-progress">p.{prog.page + 1}/{prog.totalPages}</span>
									{/if}
								{/if}
								{#if chapter.scanlator}
									<span class="chapter-scanlator">{chapter.scanlator}</span>
								{/if}
								{#if chapter.pageCount}
									<span class="chapter-pages">{chapter.pageCount}p</span>
								{/if}
							</div>
						</a>
						<button
							class="mark-btn"
							title={isRead(chapter.id) ? 'Mark as unread' : 'Mark as read'}
							onclick={(e) => markChapter(chapter, !isRead(chapter.id), e)}
						>
							{#if isRead(chapter.id)}
								<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
							{:else}
								<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
							{/if}
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<p class="has-text-grey">Work not found.</p>
{/if}

<style>
	.back-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 4px 2px;
		margin-bottom: 8px;
		font-size: 0.85rem;
		transition: color 0.15s;
	}

	.back-btn:hover {
		color: var(--text-primary);
	}

	.detail-header {
		display: flex;
		gap: 24px;
		margin-bottom: 24px;
	}

	.detail-cover {
		width: 180px;
		flex-shrink: 0;
	}

	.detail-info { flex: 1; min-width: 0; }

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
		color: var(--text-secondary);
		background: var(--bg-card);
		padding: 2px 8px;
		border-radius: 4px;
	}

	.source-badge-icon {
		width: 14px;
		height: 14px;
		border-radius: 3px;
	}

	.author {
		font-size: 0.9rem;
		color: var(--text-secondary);
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
		color: #aaa;
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
		background: var(--bg-card);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 4px;
		min-width: 180px;
		z-index: 20;
		box-shadow: 0 4px 12px rgba(0,0,0,0.3);
	}

	.picker-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 8px 12px;
		border: none;
		background: none;
		color: var(--text-primary);
		cursor: pointer;
		border-radius: 4px;
		font-size: 0.85rem;
		text-align: left;
	}

	.picker-item:hover {
		background: rgba(128,128,128,0.15);
	}

	.picker-item.active {
		background: var(--accent);
		color: #fff;
	}

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
		color: var(--text-primary);
		cursor: pointer;
		border-radius: 4px;
		font-size: 0.85rem;
	}

	.picker-checkbox:hover {
		background: rgba(128,128,128,0.15);
	}

	.picker-checkbox input[type="checkbox"] {
		accent-color: var(--accent);
	}

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

	.override-label {
		font-size: 0.8rem;
		color: var(--text-secondary);
	}

	.regen-btn {
		padding: 4px 10px;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: none;
		color: var(--text-secondary);
		font-size: 0.75rem;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}

	.regen-btn:hover {
		color: var(--text-primary);
		border-color: #555;
	}

	.chapter-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}

	.read-count {
		font-size: 0.8rem;
		color: var(--text-secondary);
	}

	.sort-btn {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
		padding: 4px 10px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.sort-btn:hover { color: var(--text-primary); border-color: #555; }

	.view-toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		background: none;
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
		border-radius: 4px;
		cursor: pointer;
		padding: 0;
	}

	.view-toggle-btn:hover { color: var(--text-primary); border-color: #555; }

	/* ── Grid view ── */

	.chapter-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 12px;
	}

	.grid-card {
		display: block;
		text-decoration: none;
		color: inherit;
		transition: transform 0.15s;
	}

	.grid-card.is-read { opacity: 0.5; }

	.grid-badge {
		position: absolute;
		top: 4px;
		right: 4px;
		padding: 2px 5px;
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: 600;
		line-height: 1.3;
		color: #fff;
	}

	.read-badge {
		background: #48c774;
		display: flex;
		align-items: center;
		padding: 3px;
	}

	.progress-badge {
		background: var(--accent);
		font-variant-numeric: tabular-nums;
	}

	.grid-title {
		font-size: 0.8rem;
		color: #ddd;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.chapter-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.chapter-row {
		display: flex;
		align-items: center;
		background: var(--bg-secondary);
		border-radius: 4px;
		transition: background 0.15s;
	}

	.chapter-row:hover { background: var(--bg-card); }
	.chapter-row.is-read { opacity: 0.5; }

	.chapter-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex: 1;
		min-width: 0;
		padding: 10px 0 10px 16px;
		text-decoration: none !important;
		color: var(--text-primary) !important;
		gap: 12px;
	}

	.chapter-left {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.read-icon { color: #48c774; flex-shrink: 0; }

	.progress-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		flex-shrink: 0;
	}

	.chapter-title {
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.chapter-right {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.chapter-progress {
		font-size: 0.75rem;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}

	.chapter-scanlator {
		font-size: 0.75rem;
		color: var(--text-secondary);
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chapter-pages {
		font-size: 0.75rem;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.mark-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		padding: 0;
		margin-right: 8px;
		border: none;
		border-radius: 4px;
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s, color 0.15s;
	}

	.chapter-row:hover .mark-btn { opacity: 1; }
	.mark-btn:hover { color: var(--accent); }

	.loader-inline {
		width: 32px;
		height: 32px;
		border: 3px solid #333;
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto;
	}

	.alternatives-section {
		margin-bottom: 20px;
	}

	.alt-loading {
		text-align: center;
		padding: 16px 0;
	}

	.alt-loading-text {
		color: var(--text-secondary);
		font-size: 0.85rem;
		margin-top: 8px;
	}

	.alt-title {
		font-size: 0.9rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
	}

	.alt-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.alt-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		background: var(--bg-secondary);
		border-radius: 6px;
		text-decoration: none !important;
		color: var(--text-primary) !important;
		transition: background 0.15s;
	}

	.alt-item:hover {
		background: var(--bg-card);
	}

	.alt-icon {
		width: 20px;
		height: 20px;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.alt-source-name {
		font-size: 0.9rem;
		font-weight: 500;
	}

	.alt-chapters {
		margin-left: auto;
		font-size: 0.8rem;
		color: var(--accent);
	}

	.alt-arrow {
		color: var(--text-secondary);
		flex-shrink: 0;
	}

	.no-chapters-msg {
		color: var(--text-secondary);
		font-size: 0.85rem;
		text-align: center;
		padding: 16px 0;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	@media (max-width: 600px) {
		.detail-header { flex-direction: column; align-items: center; text-align: center; }
		.detail-cover { width: 140px; }
		.genre-tags { justify-content: center; }
		.action-buttons { justify-content: center; }
		.chapter-scanlator { display: none; }
		.mark-btn { opacity: 1; }
	}
</style>
