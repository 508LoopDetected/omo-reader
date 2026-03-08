<script lang="ts">
	import type { Chapter } from '@omo/core';

	interface Props {
		chapter: Chapter;
		href: string;
		read: boolean;
		inProgress: boolean;
		progress?: { page: number; totalPages: number };
		onMark: (read: boolean, evt: MouseEvent) => void;
	}

	let { chapter, href, read, inProgress, progress, onMark }: Props = $props();
</script>

<div class="chapter-row" class:is-read={read}>
	<a {href} class="chapter-item">
		<div class="chapter-left">
			{#if read}
				<svg class="read-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
			{:else if inProgress}
				<div class="progress-dot"></div>
			{/if}
			<div class="chapter-title">{chapter.title}</div>
		</div>
		<div class="chapter-right">
			{#if inProgress && progress}
				<span class="chapter-progress">p.{progress.page + 1}/{progress.totalPages}</span>
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
		title={read ? 'Mark as unread' : 'Mark as read'}
		onclick={(e) => onMark(!read, e)}
	>
		{#if read}
			<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
		{:else}
			<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
		{/if}
	</button>
</div>

<style>
	.chapter-row {
		display: flex;
		align-items: center;
		background: color-mix(in oklch, var(--layer-raised) 60%, transparent);
		border: 1px solid color-mix(in oklch, var(--layer-border) 30%, transparent);
		border-radius: 5px;
		transition: all var(--transition-fast);
	}

	.chapter-row:hover {
		background: var(--layer-raised);
		border-color: var(--layer-border);
		box-shadow: var(--shadow-raised);
		transform: translateX(2px);
	}

	.chapter-row.is-read { opacity: 0.45; }
	.chapter-row.is-read:hover { opacity: 0.7; }

	.chapter-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex: 1;
		min-width: 0;
		padding: 10px 0 10px 16px;
		text-decoration: none !important;
		color: inherit !important;
		gap: 12px;
	}

	.chapter-left {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.read-icon { color: var(--color-success-500); flex-shrink: 0; }

	.progress-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-primary-500);
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
		color: var(--color-primary-500);
		font-variant-numeric: tabular-nums;
	}

	.chapter-scanlator {
		font-size: 0.75rem;
		color: inherit;
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chapter-pages {
		font-size: 0.75rem;
		color: inherit;
		white-space: nowrap;
	}

	.mark-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		padding: 0;
		margin-right: 8px;
		border: none;
		border-radius: 4px;
		background: none;
		color: inherit;
		cursor: pointer;
		opacity: 0;
		transition: all var(--transition-fast);
	}

	.chapter-row:hover .mark-btn { opacity: 1; }

	.mark-btn:hover {
		color: var(--color-primary-500);
		background: color-mix(in oklch, var(--color-primary-500) 10%, transparent);
	}

	.mark-btn:active { transform: scale(0.88); }

	@media (max-width: 600px) {
		.chapter-scanlator { display: none; }
		.mark-btn { opacity: 1; }
	}
</style>
