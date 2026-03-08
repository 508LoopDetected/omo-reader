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
	.cover-image {
		position: relative;
		aspect-ratio: 2 / 3;
		border-radius: 3px;
		overflow: hidden;
		background: var(--layer-sunken);
		border: 1px solid var(--layer-border-subtle);
		box-shadow:
			var(--shadow-float),
			inset 0 1px 0 var(--glass-highlight);
		transition: box-shadow 0.3s ease, transform 0.3s ease;
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
		color: var(--color-surface-400);
		background: linear-gradient(145deg, var(--layer-sunken), var(--layer-border));
		font-weight: 300;
	}

	.cover-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
	}

	.cover-overlay :global(*) {
		pointer-events: auto;
	}

	/* === 3D tilted book === */

	@property --book-thickness {
		syntax: '<length>';
		inherits: true;
		initial-value: 16px;
	}

	.book-3d {
		--book-thickness: 16px;
		--book-tilt: -20deg;
		transition: --book-thickness 0.4s ease;
	}

	.book-3d__inner {
		position: relative;
		transform-style: preserve-3d;
		transform: perspective(1000px) rotateY(var(--book-tilt));
	}

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

	.book-3d__inner::after {
		content: '';
		position: absolute;
		top: 0;
		left: 1%;
		width: 100%;
		height: 100%;
		transform: translateZ(calc(var(--book-thickness) * -1));
		background-color: var(--color-surface-800);
		border-radius: 0 2px 2px 0;
		box-shadow: -10px 0 50px 10px rgba(0, 0, 0, 0.3);
	}

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
		color: var(--color-surface-500);
		background: linear-gradient(135deg, var(--color-surface-800), var(--color-surface-900));
	}

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
