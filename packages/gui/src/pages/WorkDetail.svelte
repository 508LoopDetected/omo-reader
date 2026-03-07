<script lang="ts">
	import { goto, onNavigate } from '$lib/router.js';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import WorkDetailHeader from '$lib/components/work/WorkDetailHeader.svelte';
	import SectionedChapterList from '$lib/components/work/SectionedChapterList.svelte';
	import type { WorkEntry, Chapter, Source, UserLibrary, Collection, SettingDef } from '@omo/core';

	interface Alternative {
		source: Source;
		work: WorkEntry;
		chapterCount: number;
	}

	let { params, searchParams }: { params: Record<string, string>; searchParams: URLSearchParams } = $props();
	let sourceId = $derived(params.sourceId ?? '');
	let workId = $derived(params.workId ?? '');

	let backKey = $derived(`backUrl:${sourceId}:${workId}`);
	let backUrl = $state(
		sessionStorage.getItem(`backUrl:${params.sourceId}:${params.workId}`) ?? '/library'
	);
	$effect(() => {
		return onNavigate(({ from }) => {
			if (!from) return;
			const detailPath = `/work/${sourceId}/${encodeURIComponent(workId)}`;
			if (from.pathname.startsWith(detailPath + '/')) return;
			backUrl = from.pathname + from.search;
			sessionStorage.setItem(backKey, backUrl);
		});
	});

	let work: WorkEntry | null = $state(null);
	let chapters: Chapter[] = $state([]);
	let source: Source | null = $state(null);
	let loading = $state(true);
	let inLibrary = $state(false);
	let defaultSort = typeof window !== 'undefined' ? (localStorage.getItem('defaultChapterSort') as 'asc' | 'desc' | null) ?? 'asc' : 'asc';
	let chapterSort = $state<'desc' | 'asc'>(defaultSort as 'asc' | 'desc');
	let descExpanded = $state(false);
	let chapterViewExplicit = $state<'list' | 'grid' | null>(null);
	let alternatives = $state<Alternative[]>([]);
	let loadingAlternatives = $state(false);
	let userLibraries = $state<UserLibrary[]>([]);
	let currentLibraryId = $state<string | null>(null);
	let allCollections = $state<Collection[]>([]);
	let titleCollectionIds = $state<Set<string>>(new Set());
	let titleReaderDirection = $state<string | null>(null);
	let titleReaderOffset = $state<string | null>(null);
	let titleCoverArtMode = $state<string | null>(null);
	let progressMap = $state(new Map<string, { page: number; totalPages: number }>());
	let readerOverrideSettings = $state<SettingDef[]>([]);

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

	let directionOptions = $derived(readerOverrideSettings.find(s => s.key === 'reader.direction')?.options ?? [
		{ value: 'rtl', label: 'RTL' }, { value: 'ltr', label: 'LTR' },
	]);
	let offsetOptions = $derived(readerOverrideSettings.find(s => s.key === 'reader.offset')?.options ?? [
		{ value: 'true', label: 'Offset: On' }, { value: 'false', label: 'Offset: Off' },
	]);
	let coverArtOptions = $derived(readerOverrideSettings.find(s => s.key === 'cover.artMode')?.options ?? [
		{ value: 'none', label: 'Cover: None' }, { value: 'auto', label: 'Cover: Page 1' },
		{ value: 'offset', label: 'Cover: Page 2' }, { value: 'offset2', label: 'Cover: Page 3' },
	]);

	let continueChapter = $derived.by(() => {
		const sorted = [...chapters].sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
		for (const ch of sorted) {
			const prog = progressMap.get(ch.id);
			if (prog && prog.page > 0 && prog.page < prog.totalPages - 1) return ch;
		}
		for (const ch of sorted) {
			const prog = progressMap.get(ch.id);
			if (!prog || prog.page === 0) return ch;
		}
		return null;
	});

	function isRead(chapterId: string): boolean {
		const prog = progressMap.get(chapterId);
		if (!prog) return false;
		return prog.totalPages > 0 && prog.page >= prog.totalPages - 2;
	}

	function isInProgress(chapterId: string): boolean {
		const prog = progressMap.get(chapterId);
		if (!prog) return false;
		return prog.page > 0 && !isRead(chapterId);
	}

	// Section management
	let sectionGroups = $derived.by(() => {
		const groups = new Map<string, Chapter[]>();
		for (const ch of chapters) {
			const key = ch.section ?? '';
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(ch);
		}
		return groups;
	});

	let sectionNames = $derived.by(() => {
		const names: string[] = [];
		if (sectionGroups.has('')) names.push('');
		for (const key of sectionGroups.keys()) {
			if (key !== '') names.push(key);
		}
		return names;
	});

	let preferOngoing = $state(typeof window !== 'undefined' && localStorage.getItem('preferOngoingSection') === 'true');
	let selectedSection = $state<string>('');
	let sectionDropdownOpen = $state(false);

	let isAllView = $derived(selectedSection === '__all__');
	let filteredChapters = $derived(isAllView ? chapters : (sectionGroups.get(selectedSection) ?? chapters));
	let readCount = $derived(filteredChapters.filter((c) => isRead(c.id)).length);

	function primaryLabel(section: string): string {
		if (section === '__all__') return 'All';
		if (section !== '') return section;
		const chs = sectionGroups.get('') ?? chapters;
		if (chs.some((c) => c.volumeNumber != null)) return 'Collected';
		return currentLibraryType === 'western' ? 'Issues' : 'Chapters';
	}

	let chapterLabel = $derived(primaryLabel(selectedSection));
	let hasSections = $derived(sectionNames.length > 1);

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
				const map = new Map<string, { page: number; totalPages: number }>();
				for (const [chId, prog] of Object.entries(data.progressMap)) {
					map.set(chId, prog as { page: number; totalPages: number });
				}
				progressMap = map;
			}
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

	async function loadAlternatives() {
		if (!work || chapters.length > 0) return;
		loadingAlternatives = true;
		try {
			const res = await fetch(`/api/sources/${sourceId}/alternatives?title=${encodeURIComponent(work.title)}`);
			if (res.ok) alternatives = (await res.json()).alternatives;
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
			await fetch('/api/reader-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			if (field === 'direction') titleReaderDirection = value;
			else titleReaderOffset = value;
		} catch (err) { console.error('Failed to save reader setting:', err); }
	}

	async function saveCoverArtMode(value: string | null) {
		titleCoverArtMode = value;
		try {
			await fetch('/api/reader-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId, workId, coverArtMode: value }) });
			loadDetail();
		} catch (err) { console.error('Failed to save cover art mode:', err); }
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
	}

	async function addToLibrary(libraryId?: string) {
		if (!work) return;
		if (inLibrary) {
			await fetch('/api/library/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId, workId, libraryId: libraryId ?? null }) });
			currentLibraryId = libraryId ?? null;
		} else {
			await fetch('/api/library', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
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
		try {
			const [colsRes, itemColsRes] = await Promise.all([
				fetch('/api/collections'),
				fetch(`/api/collections/items?sourceId=${sourceId}&workId=${encodeURIComponent(workId)}`),
			]);
			if (colsRes.ok) allCollections = await colsRes.json();
			if (itemColsRes.ok) titleCollectionIds = new Set(await itemColsRes.json());
		} catch { /* ignore */ }
	}

	function handleAddClick() {
		if (userLibraries.length === 0) addToLibrary();
		else addToLibrary(); // picker handled in header component
	}

	async function toggleCollection(collectionId: string) {
		const has = titleCollectionIds.has(collectionId);
		const next = new Set(titleCollectionIds);
		if (has) next.delete(collectionId); else next.add(collectionId);
		titleCollectionIds = next;
		try {
			if (has) {
				await fetch(`/api/collections/items?collectionId=${collectionId}&sourceId=${sourceId}&workId=${encodeURIComponent(workId)}`, { method: 'DELETE' });
			} else {
				await fetch('/api/collections/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collectionId, sourceId, workId }) });
			}
		} catch {
			if (has) next.add(collectionId); else next.delete(collectionId);
			titleCollectionIds = new Set(next);
		}
	}

	async function markChapter(chapter: Chapter, read: boolean, evt: MouseEvent) {
		evt.preventDefault();
		evt.stopPropagation();
		await fetch('/api/progress/mark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId, workId, chapterId: chapter.id, read }) });
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

	async function regenerateThumbnails() {
		await fetch(`/api/cache/thumbnails?sourceId=${encodeURIComponent(sourceId)}&workId=${encodeURIComponent(workId)}`, { method: 'DELETE' });
		window.location.reload();
	}

	function handleReaderSettingChange(field: 'direction' | 'offset' | 'coverArtMode', value: string | null) {
		if (field === 'coverArtMode') saveCoverArtMode(value);
		else saveTitleReaderSetting(field, value);
	}

	// Close section dropdown on outside click
	$effect(() => {
		if (!sectionDropdownOpen) return;
		function handleClick() { sectionDropdownOpen = false; }
		window.addEventListener('click', handleClick);
		return () => window.removeEventListener('click', handleClick);
	});

	// Auto-select Ongoing section if preference is set and section exists
	$effect(() => {
		const names = sectionNames;
		if (preferOngoing && names.some(n => n.toLowerCase() === 'ongoing')) {
			selectedSection = names.find(n => n.toLowerCase() === 'ongoing')!;
		}
	});

	$effect(() => {
		void sourceId;
		void workId;
		selectedSection = '';
		loadDetail();
	});
</script>

{#if loading}
	<LoadingSpinner />
{:else if work}
	<div class="work-detail grid grid-cols-1 md:grid-cols-[1fr_4fr] md:gap-x-12">
		<WorkDetailHeader
			{work} {sourceId} {workId} {source} {chapters} {inLibrary}
			{currentLibraryId} {userLibraries} {allCollections} {titleCollectionIds}
			{titleReaderDirection} {titleReaderOffset} {titleCoverArtMode}
			{directionOptions} {offsetOptions} {coverArtOptions}
			onback={() => goto(backUrl)}
			onAddClick={handleAddClick}
			onRemove={removeFromLibrary}
			onAddToLibrary={addToLibrary}
			onToggleCollection={toggleCollection}
			onReaderSettingChange={handleReaderSettingChange}
			onRegenerateThumbnails={regenerateThumbnails}
		/>

		<div class="work-body">
			{#if work.description}
				<div class="description-wrap" class:collapsed={!descExpanded} class:expanded={descExpanded}>
					<p class="description">{work.description}</p>
					<button class="desc-toggle" onclick={() => descExpanded = !descExpanded}>
						{descExpanded ? 'Show less' : 'Show more'}
						<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" class:flipped={descExpanded}>
							<path d="M7 10l5 5 5-5z"/>
						</svg>
					</button>
				</div>
			{/if}
			<div class="work-chapters">
				<div class="chapter-header">
					<div class="section-selector">
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<button
							class="section-btn preset-glass-neutral"
							class:has-sections={hasSections}
							onclick={(e) => { e.stopPropagation(); if (hasSections) sectionDropdownOpen = !sectionDropdownOpen; }}
						>
							<h3 class="h5">{chapterLabel} ({filteredChapters.length})</h3>
							{#if hasSections}
								<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" class="section-caret" class:flipped={sectionDropdownOpen}>
									<path d="M7 10l5 5 5-5z"/>
								</svg>
							{/if}
						</button>
						{#if sectionDropdownOpen}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div class="section-dropdown preset-glass-neutral" onclick={(e) => e.stopPropagation()}>
								<button
									class="section-option"
									class:active={selectedSection === '__all__'}
									onclick={() => { selectedSection = '__all__'; sectionDropdownOpen = false; }}
								>
									All
									<span class="section-count">{chapters.length}</span>
								</button>
								{#each sectionNames as name}
									<button
										class="section-option"
										class:active={selectedSection === name}
										onclick={() => { selectedSection = name; sectionDropdownOpen = false; }}
									>
										{primaryLabel(name)}
										<span class="section-count">{sectionGroups.get(name)?.length ?? 0}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
					<span class="read-count">{readCount} read</span>
					{#if continueChapter}
						<a
							href="/work/{sourceId}/{encodeURIComponent(workId)}/{encodeURIComponent(continueChapter.id)}"
							class="btn btn-sm preset-gradient-primary-tertiary continue-btn"
						>
							<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
							Continue &middot; {continueChapter.title}
						</a>
					{/if}
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
								<LoadingSpinner />
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
				{:else}
					<SectionedChapterList
						chapters={filteredChapters} {sourceId} {workId} {chapterSort} {chapterView} {progressMap}
						{isRead} {isInProgress}
						onMark={markChapter}
						rootSectionLabel={isAllView ? primaryLabel('') : undefined}
					/>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<p class="text-surface-500">Work not found.</p>
{/if}

<style>

	:global(.work-detail .detail-sidebar) {
		position: sticky;
		top: 28px;
		align-self: start;
	}

	:global(.work-detail .detail-header),
	.work-body {
		min-width: 0;
	}

	.work-chapters {
		min-width: 0;
	}

	@media (min-width: 768px) {
		:global(.work-detail .detail-sidebar) {
			grid-column: 1;
			grid-row: 1 / 50;
		}

		:global(.work-detail .detail-header) {
			grid-column: 2;
		}

		.work-body {
			grid-column: 2;
		}
	}

	@media (max-width: 767px) {
		:global(.work-detail .detail-sidebar) {
			position: static;
		}

		:global(.work-detail .detail-sidebar .detail-cover) {
			display: none;
		}
	}

	.description-wrap {
		position: relative;
		margin: 0 0 16px;
	}

	.description {
		color: rgb(var(--color-surface-500));
		font-size: 0.85rem;
		line-height: 1.6;
		margin: 0;
		max-height: 1000px;
		overflow: hidden;
		transition: max-height 0.3s ease;
	}

	.description-wrap.collapsed .description {
		max-height: 4.8em;
		-webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
		mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
	}

	.desc-toggle {
		display: flex;
		align-items: center;
		gap: 4px;
		border: none;
		background: none;
		color: rgb(var(--color-surface-400));
		font-size: 0.78rem;
		cursor: pointer;
		padding: 4px 0 0;
	}

	.desc-toggle:hover {
		color: rgb(var(--color-surface-300));
	}

	.desc-toggle .flipped {
		transform: rotate(180deg);
	}

	.chapter-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
		padding: 10px 14px;
		background: color-mix(in oklch, var(--layer-raised) 50%, transparent);
		border: 1px solid color-mix(in oklch, var(--layer-border) 40%, transparent);
		border-radius: 10px;
	}

	.section-selector {
		position: relative;
	}

	.section-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		border: none;
		border-radius: 8px;
		padding: 4px 10px;
		cursor: default;
		transition: all var(--transition-fast);
	}

	.section-btn.has-sections {
		cursor: pointer;
	}

	.section-btn.has-sections:hover {
		background: color-mix(in oklch, var(--layer-border) 40%, transparent);
	}

	.section-btn h3 {
		margin: 0;
	}

	.section-caret {
		color: rgb(var(--color-surface-400));
		transition: transform 0.2s ease;
	}

	.section-caret.flipped {
		transform: rotate(180deg);
	}

	.section-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		min-width: 180px;
		border-radius: 10px;
		border: 1px solid var(--layer-border);
		box-shadow: var(--shadow-overlay);
		padding: 4px;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.section-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 12px;
		border: none;
		border-radius: 7px;
		background: none;
		color: rgb(var(--color-surface-300));
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
		text-align: left;
	}

	.section-option:hover {
		background: color-mix(in oklch, var(--layer-border) 40%, transparent);
		color: inherit;
	}

	.section-option.active {
		background: color-mix(in oklch, rgb(var(--color-primary-500)) 15%, transparent);
		color: rgb(var(--color-primary-400));
	}

	.section-count {
		font-size: 0.75rem;
		color: rgb(var(--color-surface-500));
		font-variant-numeric: tabular-nums;
	}

	.read-count {
		font-size: 0.75rem;
		color: rgb(var(--color-surface-400));
		font-variant-numeric: tabular-nums;
	}

	.sort-btn {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: 1px solid rgb(var(--color-surface-300) / 0.3);
		color: rgb(var(--color-surface-500));
		padding: 4px 10px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.78rem;
		transition: all var(--transition-fast);
	}

	.sort-btn:hover {
		color: inherit;
		border-color: var(--layer-border);
		background: color-mix(in oklch, var(--layer-border) 25%, transparent);
	}

	.sort-btn:active { transform: scale(0.97); }

	.view-toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		background: none;
		border: 1px solid rgb(var(--color-surface-300) / 0.3);
		color: rgb(var(--color-surface-500));
		border-radius: 6px;
		cursor: pointer;
		padding: 0;
		transition: all var(--transition-fast);
	}

	.view-toggle-btn:hover {
		color: inherit;
		border-color: var(--layer-border);
		background: color-mix(in oklch, var(--layer-border) 25%, transparent);
	}

	.view-toggle-btn:active { transform: scale(0.93); }

	.alternatives-section { margin-bottom: 20px; }

	.alt-loading { text-align: center; padding: 16px 0; }

	.alt-loading-text {
		color: rgb(var(--color-surface-500));
		font-size: 0.85rem;
		margin-top: 8px;
	}

	.alt-title {
		font-size: 0.75rem;
		color: rgb(var(--color-surface-400));
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
		margin-bottom: 8px;
	}

	.alt-list { display: flex; flex-direction: column; gap: 3px; }

	.alt-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		background: color-mix(in oklch, var(--layer-raised) 60%, transparent);
		border: 1px solid color-mix(in oklch, var(--layer-border) 30%, transparent);
		border-radius: 10px;
		text-decoration: none !important;
		color: inherit !important;
		transition: all var(--transition-fast);
	}

	.alt-item:hover {
		background: var(--layer-raised);
		border-color: var(--layer-border);
		box-shadow: var(--shadow-raised);
		transform: translateX(3px);
	}

	.alt-icon { width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0; }
	.alt-source-name { font-size: 0.9rem; font-weight: 500; }
	.alt-chapters { margin-left: auto; font-size: 0.8rem; color: rgb(var(--color-primary-500)); }
	.alt-arrow { color: rgb(var(--color-surface-400)); flex-shrink: 0; transition: transform var(--transition-fast); }
	.alt-item:hover .alt-arrow { transform: translateX(2px); }

	.no-chapters-msg {
		color: rgb(var(--color-surface-500));
		font-size: 0.85rem;
		text-align: center;
		padding: 16px 0;
	}
</style>
