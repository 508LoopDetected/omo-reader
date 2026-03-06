<script lang="ts">
	import { thumbnailUrl } from '$lib/utils/thumbnail.js';
	import type { Snippet } from 'svelte';

	interface Props {
		url?: string | null;
		sourceId?: string;
		workId?: string;
		alt?: string;
		loading?: 'lazy' | 'eager';
		fallbackChar?: string;
		overlay?: Snippet;
		tilt?: boolean;
		thickness?: number;
	}

	let { url, sourceId, workId, alt = '', loading = 'lazy', fallbackChar, overlay, tilt = false, thickness }: Props = $props();

	let src = $derived(thumbnailUrl(url, sourceId, workId));
</script>

{#if tilt}
	<div
		class="book-3d"
		style:--book-thickness={thickness != null ? `${thickness}px` : undefined}
	>
		<div class="book-3d__inner">
			{#if src}
				<img class="book-3d__cover" {src} {alt} {loading} />
			{:else}
				<div class="book-3d__cover book-3d__placeholder">
					<span>{fallbackChar ?? '?'}</span>
				</div>
			{/if}
			{#if overlay}
				<div class="book-3d__overlay">
					{@render overlay()}
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div class="cover-image">
		{#if src}
			<img {src} {alt} {loading} />
		{:else}
			<div class="placeholder">
				<span>{fallbackChar ?? '?'}</span>
			</div>
		{/if}
		{#if overlay}
			<div class="cover-overlay">
				{@render overlay()}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* === Flat cover (default) === */

	.cover-image {
		position: relative;
		aspect-ratio: 2 / 3;
		border-radius: 6px;
		overflow: hidden;
		background: var(--bg-card, #1a1a2e);
	}

	.cover-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2.5rem;
		color: #555;
		background: linear-gradient(135deg, #1a1a2e, #16213e);
	}

	.cover-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.cover-overlay :global(*) {
		pointer-events: auto;
	}

	/* === 3D tilted book === */

	.book-3d {
		--book-thickness: 16px;
		--book-tilt: -20deg;
		--cover-color: var(--bg-card, #1a1a2e);
		perspective: 1000px;
	}

	.book-3d__inner {
		position: relative;
		transform-style: preserve-3d;
		transform: rotateY(var(--book-tilt));
	}

	/* Pages (right edge) */
	.book-3d__inner::before {
		position: absolute;
		content: '';
		left: 100%;
		top: 1%;
		width: calc(var(--book-thickness) * 2);
		height: 98%;
		transform: translate(-55%, 0) rotateY(90deg);
		background: linear-gradient(90deg,
			#fff 0%, hsl(0, 0%, 94%) 5%, #fff 10%, hsl(0, 0%, 94%) 15%,
			#fff 20%, hsl(0, 0%, 94%) 25%, #fff 30%, hsl(0, 0%, 94%) 35%,
			#fff 40%, hsl(0, 0%, 94%) 45%, #fff 50%, hsl(0, 0%, 94%) 55%,
			#fff 60%, hsl(0, 0%, 94%) 65%, #fff 70%, hsl(0, 0%, 94%) 75%,
			#fff 80%, hsl(0, 0%, 94%) 85%, #fff 90%, hsl(0, 0%, 94%) 95%,
			#fff 100%
		);
	}

	/* Rear cover */
	.book-3d__inner::after {
		content: '';
		position: absolute;
		top: 0;
		left: 1%;
		width: 100%;
		height: 100%;
		transform: translateZ(calc(var(--book-thickness) * -1));
		background-color: var(--cover-color);
		border-radius: 0 2px 2px 0;
		box-shadow: -10px 0 50px 10px rgba(0, 0, 0, 0.3);
	}

	/* Front cover */
	.book-3d__cover {
		display: block;
		width: 100%;
		aspect-ratio: 2 / 3;
		object-fit: cover;
		border-radius: 0 2px 2px 0;
		transform: translateZ(var(--book-thickness));
		box-shadow: 5px 5px 20px rgba(0, 0, 0, 0.1);
	}

	.book-3d__placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2.5rem;
		color: #555;
		background: linear-gradient(135deg, #1a1a2e, #16213e);
	}

	/* Overlay on front cover face */
	.book-3d__overlay {
		position: absolute;
		inset: 0;
		transform: translateZ(var(--book-thickness));
		pointer-events: none;
	}

	.book-3d__overlay :global(*) {
		pointer-events: auto;
	}
</style>
