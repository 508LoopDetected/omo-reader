<script lang="ts">
	import { tick } from 'svelte';
	import { thumbnailUrl } from '$lib/utils/thumbnail.js';
	import CoverImage from '$lib/components/CoverImage.svelte';
	import HalftoneBanner from '$lib/components/HalftoneBanner.svelte';
	import ContinueCard from './ContinueCard.svelte';

	interface ContinueItem {
		sourceId: string;
		workId: string;
		chapterId: string;
		page: number;
		totalPages: number;
		updatedAt: string;
		title?: string;
		chapterTitle?: string;
		coverUrl?: string;
		bannerUrl?: string;
		nsfw?: boolean;
	}

	interface Props {
		items: ContinueItem[];
		onDismiss: (item: ContinueItem, evt: MouseEvent) => void;
		onReset: (item: ContinueItem, evt: MouseEvent) => void;
	}

	let { items, onDismiss, onReset }: Props = $props();

	let activeIndex = $state(0);
	let paused = $state(false);
	let menuOpen = $state(false);
	let listEl = $state<HTMLDivElement>();

	let current = $derived(items[activeIndex] ?? items[0]);

	// Background image: prefer banner, fall back to cover thumbnail
	let bgImage = $derived(current?.bannerUrl ?? thumbnailUrl(current?.coverUrl, current?.sourceId, current?.workId) ?? current?.coverUrl);

	let progress = $derived(current && current.totalPages > 0 ? ((current.page + 1) / current.totalPages) * 100 : 0);
	let readerHref = $derived(current && `/work/${current.sourceId}/${encodeURIComponent(current.workId)}/${encodeURIComponent(current.chapterId)}`);

	// Auto-rotation
	$effect(() => {
		if (items.length <= 1 || paused) return;
		const interval = setInterval(() => {
			activeIndex = (activeIndex + 1) % items.length;
		}, 7000);
		return () => clearInterval(interval);
	});

	// Clamp activeIndex when items change
	$effect(() => {
		if (activeIndex >= items.length) activeIndex = 0;
	});

	// Auto-scroll active item into view in the sidebar
	$effect(() => {
		void activeIndex;
		tick().then(() => {
			if (!listEl) return;
			const activeEl = listEl.querySelector('.active') as HTMLElement;
			if (activeEl) {
				activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
		});
	});

	function toggleMenu(evt: MouseEvent) {
		evt.preventDefault();
		evt.stopPropagation();
		menuOpen = !menuOpen;
	}

	$effect(() => {
		if (!menuOpen) return;
		function closeMenu() { menuOpen = false; }
		window.addEventListener('click', closeMenu);
		return () => window.removeEventListener('click', closeMenu);
	});

</script>

{#if current}
<div class="continue-section">
	{#if bgImage}
		<HalftoneBanner src={bgImage} />
	{/if}

	<!-- svelte-ignore a11y_no_redundant_roles -->
	<div
		class="hero-row"
		onmouseenter={() => paused = true}
		onmouseleave={() => { paused = false; menuOpen = false; }}
		role="region"
		aria-label="Continue Reading"
	>
		<div class="hero-spotlight">
			{#key activeIndex}
				<div class="spotlight-inner">
					<a href={readerHref} class="spotlight-cover">
						<CoverImage url={current.coverUrl} sourceId={current.sourceId} workId={current.workId} alt={current.title ?? 'Manga'} fallbackChar={(current.title ?? '?').charAt(0)} tilt />
					</a>
					<div class="spotlight-info">
						<h2 class="spotlight-title">{current.title ?? current.workId}</h2>
						<div class="spotlight-meta">
							{#if current.chapterTitle}{current.chapterTitle} &middot; {/if}Page {current.page + 1} of {current.totalPages}
						</div>
						<div class="spotlight-progress-track">
							<div class="spotlight-progress-bar" style="width: {progress}%"></div>
						</div>
						<div class="spotlight-actions">
							<a href={readerHref} class="btn btn-sm preset-filled-primary-500">Continue</a>
							<div class="relative">
								<button class="btn btn-sm preset-tonal-surface" onclick={toggleMenu} aria-label="Options">
									<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
								</button>
								{#if menuOpen}
									<div class="hero-menu">
										<button class="hero-menu-item" onclick={(e) => { menuOpen = false; onDismiss(current, e); }}>Dismiss</button>
										<button class="hero-menu-item text-error-500" onclick={(e) => { menuOpen = false; onReset(current, e); }}>Reset progress</button>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/key}

			<!-- Nav dots (visible on mobile where sidebar is hidden) -->
			{#if items.length > 1}
				<div class="hero-dots">
					{#each items as _, i}
						<button
							class="hero-dot"
							class:active={i === activeIndex}
							onclick={() => { activeIndex = i; }}
							aria-label="Show item {i + 1}"
						></button>
					{/each}
				</div>
			{/if}
		</div>

		{#if items.length > 1}
			<aside class="up-next-sidebar">
				<div class="sidebar-list" bind:this={listEl}>
					{#each items as item, i}
						<ContinueCard
							{item}
							compact
							active={i === activeIndex}
							onclick={() => { activeIndex = i; }}
						/>
					{/each}
				</div>
			</aside>
		{/if}
	</div>
</div>
{/if}

<style>
	/* ── Section wrapper — positions the halftone bg behind everything ── */

	.continue-section {
		position: relative;
		margin-bottom: 1.5rem;
		z-index: 1;
	}

	/* ── Content row ── */

	.hero-row {
		position: relative;
		display: flex;
		gap: 16px;
		padding: 24px 0;
		align-items: flex-end;
	}

	/* ── Spotlight (left) ── */

	.hero-spotlight {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		min-width: 0;
	}

	.spotlight-inner {
		display: flex;
		gap: 20px;
		align-items: flex-end;
		animation: spotlight-slide-in 0.4s ease both;
	}

	@keyframes spotlight-slide-in {
		from {
			opacity: 0;
			transform: translateX(20px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.spotlight-cover {
		flex-shrink: 0;
		width: 180px;
	}

	.spotlight-info {
		flex: 1;
		min-width: 0;
		padding-bottom: 4px;
	}

	.spotlight-title {
		font-size: 1.3rem;
		font-weight: 700;
		color: #fff;
		margin: 0 0 6px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-shadow: 0 2px 8px rgba(0,0,0,0.5);
	}

	.spotlight-meta {
		font-size: 0.8rem;
		color: rgba(255,255,255,0.65);
		margin-bottom: 8px;
	}

	.spotlight-progress-track {
		height: 4px;
		background: rgba(255,255,255,0.15);
		border-radius: 2px;
		overflow: hidden;
		margin-bottom: 12px;
		max-width: 260px;
	}

	.spotlight-progress-bar {
		height: 100%;
		background: linear-gradient(90deg, var(--color-secondary-500), var(--color-tertiary-500));
		border-radius: 2px;
		transition: width 0.4s ease;
		box-shadow: 0 0 8px color-mix(in oklch, var(--color-tertiary-500) 50%, transparent);
	}

	.spotlight-actions {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	/* ── Hero context menu ── */

	.hero-menu {
		position: absolute;
		bottom: 100%;
		left: 0;
		margin-bottom: 4px;
		background: var(--layer-raised);
		border: 1px solid var(--layer-border);
		border-radius: 4px;
		z-index: 10;
		min-width: 140px;
		box-shadow: var(--shadow-overlay);
		overflow: hidden;
	}

	.hero-menu-item {
		display: block;
		width: 100%;
		padding: 8px 12px;
		border: none;
		background: none;
		text-align: left;
		font-size: 0.75rem;
		color: inherit;
		cursor: pointer;
		transition: background 0.1s;
	}

	.hero-menu-item:hover {
		background: var(--layer-sunken);
	}

	/* ── Nav dots ── */

	.hero-dots {
		display: flex;
		gap: 6px;
		margin-top: 12px;
	}

	.hero-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: none;
		padding: 0;
		background: rgba(255,255,255,0.3);
		cursor: pointer;
		transition: background 0.2s, transform 0.2s;
	}

	.hero-dot.active {
		background: var(--color-primary-500);
		transform: scale(1.25);
	}

	.hero-dot:hover:not(.active) {
		background: rgba(255,255,255,0.6);
	}

	/* ── Up Next sidebar ── */

	.up-next-sidebar {
		width: 340px;
		flex-shrink: 0;
		max-height: clamp(260px, 36vh, 420px);
		border-radius: 12px;
		background: color-mix(in oklch, var(--layer-sunken) 80%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid color-mix(in oklch, var(--layer-border) 60%, transparent);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.sidebar-list {
		flex: 1;
		overflow-y: auto;
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		scrollbar-width: thin;
		scrollbar-color: rgba(255,255,255,0.15) transparent;
	}

	.sidebar-list::-webkit-scrollbar {
		width: 4px;
	}

	.sidebar-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.sidebar-list::-webkit-scrollbar-thumb {
		background: rgba(255,255,255,0.15);
		border-radius: 2px;
	}

	/* ── Responsive ── */

	@media (max-width: 768px) {
		.up-next-sidebar {
			display: none;
		}

		.hero-row {
			padding: 16px 0;
		}

		.spotlight-cover {
			width: 120px;
		}

		.spotlight-title {
			font-size: 1.1rem;
		}
	}
</style>
