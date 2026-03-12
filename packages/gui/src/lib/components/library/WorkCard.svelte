<script lang="ts">
	import CoverImage from '$lib/components/CoverImage.svelte';

	interface Props {
		title: string;
		coverUrl?: string;
		sourceId?: string;
		workId?: string;
		href: string;
		badge?: string;
		badgeColor?: string;
		subtitle?: string;
		nsfw?: boolean;
		unavailable?: boolean;
		onRemove?: () => void;
	}

	let { title, coverUrl, sourceId, workId, href, badge, badgeColor, subtitle, nsfw, unavailable, onRemove }: Props = $props();

	let menuOpen = $state(false);
	let confirming = $state(false);

	function handleCogClick(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		menuOpen = !menuOpen;
		confirming = false;
	}

	function handleRemoveClick(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		confirming = true;
	}

	function handleConfirm(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		menuOpen = false;
		confirming = false;
		onRemove?.();
	}

	function handleCancel(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		confirming = false;
	}

	$effect(() => {
		if (!menuOpen) return;
		function onClick() { menuOpen = false; confirming = false; }
		window.addEventListener('click', onClick);
		return () => window.removeEventListener('click', onClick);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="work-card-wrap" class:menu-open={menuOpen}>
	<a {href} class="work-card" class:opacity-40={unavailable} class:pointer-events-none={unavailable}>
		<CoverImage url={coverUrl} {sourceId} {workId} alt={title} fallbackChar={title.charAt(0)}>
			{#snippet overlay()}
				{#if unavailable}
					<div class="badge-label bg-surface-500/85 text-[0.6rem]">Disconnected</div>
				{:else if nsfw}
					<div class="badge-label bg-error-500">18+</div>
				{:else if badge}
					<div class="badge-label" style:background={badgeColor ?? 'var(--color-primary-500)'}>{badge}</div>
				{/if}
			{/snippet}
		</CoverImage>
		<div class="text-[0.85rem] text-surface-800 dark:text-surface-200 leading-tight mt-1.5 line-clamp-2">{title}</div>
		{#if subtitle}
			<div class="text-xs text-surface-500 mt-0.5">{subtitle}</div>
		{/if}
	</a>

	{#if onRemove}
		<button class="card-cog" onclick={handleCogClick} title="Options">
			<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
		</button>

		{#if menuOpen}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="card-menu" onclick={(e) => e.stopPropagation()}>
				{#if confirming}
					<div class="card-menu-confirm">Remove?</div>
					<div class="card-menu-confirm-actions">
						<button class="card-menu-item card-menu-danger" onclick={handleConfirm}>Yes</button>
						<button class="card-menu-item" onclick={handleCancel}>No</button>
					</div>
				{:else}
					<button class="card-menu-item card-menu-danger" onclick={handleRemoveClick}>
						<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
						Remove
					</button>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.work-card-wrap {
		position: relative;
	}

	.work-card {
		display: block;
		text-decoration: none;
		transition: transform var(--transition-spring);
	}

	.work-card:hover {
		transform: translateY(-4px) scale(1.015);
	}

	.work-card:hover :global(.cover-image) {
		box-shadow: var(--shadow-overlay);
	}

	.work-card:active {
		transform: translateY(-1px) scale(0.99);
		transition-duration: 0.1s;
	}

	.badge-label {
		position: absolute;
		top: 6px;
		right: 6px;
		color: #fff;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 3px;
		line-height: 1.3;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
	}

	/* ── Cog button ── */

	.card-cog {
		position: absolute;
		top: 6px;
		right: 6px;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border: none;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.6);
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		backdrop-filter: blur(6px);
		opacity: 0;
		transition: opacity 0.15s, background 0.15s;
	}

	.work-card-wrap:hover .card-cog,
	.work-card-wrap.menu-open .card-cog {
		opacity: 1;
	}

	.card-cog:hover {
		background: rgba(0, 0, 0, 0.8);
		color: #fff;
	}

	/* ── Dropdown menu ── */

	.card-menu {
		position: absolute;
		top: 34px;
		right: 6px;
		z-index: 20;
		min-width: 130px;
		padding: 4px;
		border-radius: 5px;
		background: var(--layer-raised);
		border: 1px solid var(--layer-border);
		box-shadow: var(--shadow-overlay);
	}

	.card-menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 7px 10px;
		border: none;
		border-radius: 4px;
		background: none;
		color: var(--color-surface-300);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.1s;
	}

	.card-menu-item:hover {
		background: var(--layer-sunken);
	}

	.card-menu-danger {
		color: var(--color-error-500);
	}

	.card-menu-danger:hover {
		background: color-mix(in oklch, var(--color-error-500) 10%, transparent);
	}

	.card-menu-confirm {
		padding: 6px 10px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-surface-300);
		text-align: center;
	}

	.card-menu-confirm-actions {
		display: flex;
		gap: 2px;
	}

	.card-menu-confirm-actions .card-menu-item {
		flex: 1;
		justify-content: center;
	}
</style>
