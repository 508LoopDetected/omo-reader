<script lang="ts">
	import CoverImage from '$lib/components/CoverImage.svelte';

	interface ContinueItem {
		sourceId: string;
		workId: string;
		chapterId: string;
		page: number;
		totalPages: number;
		title?: string;
		chapterTitle?: string;
		coverUrl?: string;
	}

	interface Props {
		item: ContinueItem;
		active?: boolean;
		compact?: boolean;
		onclick?: () => void;
	}

	let { item, active = false, compact = false, onclick }: Props = $props();

	let progress = $derived(item.totalPages > 0 ? ((item.page + 1) / item.totalPages) * 100 : 0);
	let readerHref = $derived(`/work/${item.sourceId}/${encodeURIComponent(item.workId)}/${encodeURIComponent(item.chapterId)}`);
</script>

{#if compact}
	<button class="compact-card" class:active onclick={onclick} type="button">
		<div class="compact-cover">
			<CoverImage url={item.coverUrl} sourceId={item.sourceId} workId={item.workId} alt={item.title ?? 'Manga'} fallbackChar={(item.title ?? '?').charAt(0)} />
			<div class="compact-progress">
				<div class="compact-progress-bar" style="width: {progress}%"></div>
			</div>
		</div>
		<div class="compact-info">
			<div class="compact-title">{item.title ?? item.workId}</div>
			{#if item.chapterTitle}
				<div class="compact-chapter">{item.chapterTitle}</div>
			{/if}
			<div class="compact-page">Page {item.page + 1}/{item.totalPages}</div>
		</div>
	</button>
{:else}
	<a href={readerHref} class="continue-card" data-tilt-hover>
		<CoverImage url={item.coverUrl} sourceId={item.sourceId} workId={item.workId} alt={item.title ?? 'Manga'} fallbackChar={(item.title ?? '?').charAt(0)}>
			{#snippet overlay()}
				<div class="card-progress">
					<div class="card-progress-bar" style="width: {progress}%"></div>
				</div>
			{/snippet}
		</CoverImage>
		<div class="card-label">{item.title ?? item.workId}</div>
		<div class="card-sub">Page {item.page + 1}/{item.totalPages}</div>
	</a>
{/if}

<style>
	/* ── Standard card ── */

	.continue-card {
		display: block;
		text-decoration: none;
		transition: transform var(--transition-spring);
	}

	.continue-card:hover {
		transform: translateY(-4px) scale(1.015);
	}

	.card-label {
		font-size: 0.75rem;
		color: var(--color-surface-200);
		margin-top: 4px;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-sub {
		font-size: 0.75rem;
		color: var(--color-surface-500);
	}

	.card-progress {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 0 0 5px 5px;
		overflow: hidden;
	}

	.card-progress-bar {
		height: 100%;
		background: linear-gradient(90deg, var(--color-primary-600), var(--color-primary-400));
		border-radius: 0 2px 2px 0;
		box-shadow: 0 0 6px color-mix(in oklch, var(--color-primary-500) 50%, transparent);
	}

	/* ── Compact card (for Up Next strip) ── */

	.compact-card {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 8px 10px 8px 7px;
		border: none;
		border-left: 3px solid transparent;
		border-radius: 6px;
		background: transparent;
		color: inherit;
		cursor: pointer;
		text-align: left;
		transition: background 0.2s, border-color 0.3s, box-shadow 0.2s;
		width: 100%;
	}

	.compact-card:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.compact-card.active {
		background: rgba(255, 255, 255, 0.1);
		border-left-color: var(--color-tertiary-500);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
	}

	.compact-cover {
		position: relative;
		width: 56px;
		flex-shrink: 0;
	}

	.compact-cover :global(.cover-image) {
		border-radius: 3px;
	}

	.compact-progress {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 0 0 3px 3px;
		overflow: hidden;
	}

	.compact-progress-bar {
		height: 100%;
		background: linear-gradient(90deg, var(--color-secondary-500), var(--color-tertiary-500));
	}

	.compact-info {
		flex: 1;
		min-width: 0;
	}

	.compact-title {
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.compact-chapter {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.6);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.compact-page {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.5);
		margin-top: 1px;
	}
</style>
