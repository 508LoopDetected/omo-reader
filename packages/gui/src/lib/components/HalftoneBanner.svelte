<script lang="ts">
	/**
	 * Self-contained halftone banner background.
	 * Reparents itself to .content-area so it spans the full viewport width
	 * (behind sidebar + scroll area). Renders a blurred image with an animated
	 * halftone dot overlay, fading out towards the bottom.
	 *
	 * Usage: just drop <HalftoneBanner src={url} /> anywhere inside .content-area's
	 * descendant tree. Crossfades automatically when src changes.
	 */

	interface Props {
		src: string;
	}

	let { src }: Props = $props();

	let wrapperEl = $state<HTMLDivElement>();

	// Reparent to .content-area so the banner spans full viewport width
	$effect(() => {
		if (!wrapperEl) return;
		const contentArea = wrapperEl.closest('.content-area');
		if (contentArea) {
			contentArea.appendChild(wrapperEl);
			return () => { wrapperEl?.remove(); };
		}
	});
</script>

<div class="banner-bg" bind:this={wrapperEl} aria-hidden="true">
	{#key src}
		<div class="halftone-banner">
			<img {src} alt="" class="banner-img" />
			<div class="halftone">
				<img {src} alt="" class="halftone-img" />
			</div>
		</div>
	{/key}
</div>

<style>
	/* ── Outer wrapper — reparented to .content-area ── */

	.banner-bg {
		position: absolute;
		top: -5%;
		left: 0;
		right: 0;
		bottom: 0;
		overflow: hidden;
		z-index: -1;
		-webkit-mask-image: linear-gradient(to bottom, black 20%, transparent 95%);
		mask-image: linear-gradient(to bottom, black 20%, transparent 95%);
		pointer-events: none;
	}

	/* ── Halftone visual ── */

	.halftone-banner {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}

	.banner-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center top;
		filter: blur(4px) saturate(125%);
		transform: scale(1.05);
		opacity: 0.25;
	}

	.halftone {
		position: absolute;
		inset: 0;
		overflow: hidden;
		transform: translateZ(0);
		mix-blend-mode: color-burn;
		opacity: 0.15;
		filter: contrast(20);
	}

	.halftone-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center top;
		transform: scale(1.05);
		animation: halftone-filter 60s linear infinite alternate;
	}

	.halftone::after {
		content: '';
		position: absolute;
		top: -100%;
		left: -100%;
		right: -100%;
		bottom: -100%;
		background: radial-gradient(5px 5px, white, black);
		background-size: 6px 6px;
		mix-blend-mode: color-dodge;
		pointer-events: none;
		z-index: 1;
		animation: halftone-overlay 60s linear infinite alternate;
	}

	@keyframes halftone-overlay {
		0% { transform: rotate(11.25deg); }
		100% { transform: rotate(13deg) scale(1.5); }
	}

	@keyframes halftone-filter {
		0% { filter: brightness(0.5) blur(6px); }
		100% { filter: brightness(0.5) blur(10px); }
	}
</style>
