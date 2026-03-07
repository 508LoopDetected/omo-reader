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
	let chapterSort = $state<'desc' | 'asc'>('asc');
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

	let readCount = $derived(chapters.filter((c) => isRead(c.id)).length);

	let chapterLabel = $derived(
		chapters.some((c) => c.volumeNumber != null)
			? 'Collected'
			: currentLibraryType === 'western' ? 'Issues' : 'Chapters'
	);

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

	$effect(() => {
		void sourceId;
		void workId;
		loadDetail();
	});
</script>

{#if loading}
	<LoadingSpinner />
{:else if work}
	<div class="work-detail">
		<button class="back-btn" onclick={() => goto(backUrl)}>
			<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
			Back
		</button>

		<WorkDetailHeader
			{work} {sourceId} {workId} {source} {chapters} {inLibrary}
			{currentLibraryId} {userLibraries} {allCollections} {titleCollectionIds}
			{continueChapter} {titleReaderDirection} {titleReaderOffset} {titleCoverArtMode}
			{directionOptions} {offsetOptions} {coverArtOptions}
			onAddClick={handleAddClick}
			onRemove={removeFromLibrary}
			onAddToLibrary={addToLibrary}
			onToggleCollection={toggleCollection}
			onReaderSettingChange={handleReaderSettingChange}
			onRegenerateThumbnails={regenerateThumbnails}
		/>

		<div class="chapter-header">
			<h3 class="h5">{chapterLabel} ({chapters.length})</h3>
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
				{chapters} {sourceId} {workId} {chapterSort} {chapterView} {progressMap}
				{isRead} {isInProgress}
				onMark={markChapter}
			/>
		{/if}
	</div>
{:else}
	<p class="text-surface-500">Work not found.</p>
{/if}

<style>
	.back-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: none;
		color: rgb(var(--color-surface-500));
		cursor: pointer;
		padding: 4px 2px;
		margin-bottom: 8px;
		font-size: 0.85rem;
		transition: color 0.15s;
	}

	.back-btn:hover { color: rgb(var(--color-surface-800)); }
	:global(.dark) .back-btn:hover { color: rgb(var(--color-surface-200)); }

	.chapter-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}

	.read-count {
		font-size: 0.8rem;
		color: rgb(var(--color-surface-500));
	}

	.sort-btn {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: 1px solid rgb(var(--color-surface-200) / 0.1);
		color: rgb(var(--color-surface-500));
		padding: 4px 10px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.sort-btn:hover { color: rgb(var(--color-surface-800)); border-color: rgb(var(--color-surface-400)); }
	:global(.dark) .sort-btn:hover { color: rgb(var(--color-surface-200)); border-color: rgb(var(--color-surface-600)); }

	.view-toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		background: none;
		border: 1px solid rgb(var(--color-surface-200) / 0.1);
		color: rgb(var(--color-surface-500));
		border-radius: 4px;
		cursor: pointer;
		padding: 0;
	}

	.view-toggle-btn:hover { color: rgb(var(--color-surface-800)); border-color: rgb(var(--color-surface-400)); }
	:global(.dark) .view-toggle-btn:hover { color: rgb(var(--color-surface-200)); border-color: rgb(var(--color-surface-600)); }

	.alternatives-section { margin-bottom: 20px; }

	.alt-loading { text-align: center; padding: 16px 0; }

	.alt-loading-text {
		color: rgb(var(--color-surface-500));
		font-size: 0.85rem;
		margin-top: 8px;
	}

	.alt-title {
		font-size: 0.9rem;
		color: rgb(var(--color-surface-500));
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
	}

	.alt-list { display: flex; flex-direction: column; gap: 4px; }

	.alt-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		background: rgb(var(--color-surface-100));
		border-radius: 6px;
		text-decoration: none !important;
		color: inherit !important;
		transition: background 0.15s;
	}

	:global(.dark) .alt-item { background: rgb(var(--color-surface-900)); }
	.alt-item:hover { background: rgb(var(--color-surface-200)); }
	:global(.dark) .alt-item:hover { background: rgb(var(--color-surface-800)); }

	.alt-icon { width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0; }
	.alt-source-name { font-size: 0.9rem; font-weight: 500; }
	.alt-chapters { margin-left: auto; font-size: 0.8rem; color: rgb(var(--color-primary-500)); }
	.alt-arrow { color: rgb(var(--color-surface-500)); flex-shrink: 0; }

	.no-chapters-msg {
		color: rgb(var(--color-surface-500));
		font-size: 0.85rem;
		text-align: center;
		padding: 16px 0;
	}
</style>
