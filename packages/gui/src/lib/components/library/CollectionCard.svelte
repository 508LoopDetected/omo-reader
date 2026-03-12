<script lang="ts">
	import CoverImage from '$lib/components/CoverImage.svelte';

	interface Props {
		name: string;
		href: string;
		coverUrls: (string | null)[];
		count: number;
	}

	let { name, href, coverUrls, count }: Props = $props();

	let covers = $derived(coverUrls.filter((u): u is string => !!u));
	let hasCycle = $derived(covers.length > 1);

	// Front cover state
	let activeIndex = $state(0);
	let wipeKey = $state(0);
	let settledUrl = $state<string | null>(null);
	let incomingUrl = $state<string | null>(null);

	// Behind cover state
	let behindWipeKey = $state(0);
	let settledBehindUrl = $state<string | null>(null);
	let incomingBehindUrl = $state<string | null>(null);

	// Initialize
	$effect(() => {
		settledUrl = covers[0] ?? null;
		settledBehindUrl = covers[1] ?? null;
		activeIndex = 0;
		incomingUrl = null;
		incomingBehindUrl = null;
		wipeKey = 0;
		behindWipeKey = 0;
	});

	// Auto-cycle: behind wipes first, front follows via animation-delay
	$effect(() => {
		if (!hasCycle) return;
		const interval = setInterval(() => {
			// Settle previous incoming covers
			if (incomingUrl) settledUrl = incomingUrl;
			if (incomingBehindUrl) settledBehindUrl = incomingBehindUrl;

			// Advance
			activeIndex = (activeIndex + 1) % covers.length;
			const nextBehindIndex = (activeIndex + 1) % covers.length;

			// Fire both wipes — CSS delay on the front creates the cascade
			incomingBehindUrl = covers[nextBehindIndex] ?? null;
			behindWipeKey++;
			incomingUrl = covers[activeIndex] ?? null;
			wipeKey++;
		}, 4000);
		return () => clearInterval(interval);
	});
</script>

<a {href} class="collection-card" class:has-stack={hasCycle}>
	<div class="cover-stack">
		{#if hasCycle}
			<div class="stack-behind">
				<CoverImage url={settledBehindUrl} alt="" fallbackChar="" />
				{#if incomingBehindUrl}
					{#key behindWipeKey}
						<div class="behind-incoming halftone-wipe">
							<CoverImage url={incomingBehindUrl} alt="" fallbackChar="" />
						</div>
					{/key}
				{/if}
			</div>
		{/if}
		<div class="stack-front">
			<CoverImage url={settledUrl} alt={name} fallbackChar={name.charAt(0)} />

			{#if incomingUrl}
				{#key wipeKey}
					<div class="cover-incoming halftone-wipe">
						<CoverImage url={incomingUrl} alt={name} fallbackChar={name.charAt(0)} />
					</div>
				{/key}
			{/if}

			<div class="card-overlay">
				<div class="count-badge">{count}</div>
				<div class="collection-label">Collection</div>
			</div>
		</div>
	</div>
	<div class="card-title">{name}</div>
</a>

<style>
	.collection-card {
		display: block;
		text-decoration: none;
		color: inherit;
		transition: transform var(--transition-spring);
	}

	.collection-card:hover {
		transform: translateY(-4px) scale(1.015);
	}

	.collection-card:hover :global(.stack-front .cover-image) {
		box-shadow: var(--shadow-overlay);
	}

	.collection-card:active {
		transform: translateY(-1px) scale(0.99);
		transition-duration: 0.1s;
	}

	/* ── Incoming cover positioning ── */

	.cover-incoming,
	.behind-incoming {
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: none;
	}

	.cover-incoming :global(.cover-image),
	.behind-incoming :global(.cover-image) {
		box-shadow: none !important;
	}

	/* Cascade: behind wipes immediately, front follows after a delay */
	.cover-incoming {
		animation-delay: 250ms;
	}

	/* ── Overlay ── */

	.card-overlay {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
	}

	.count-badge {
		position: absolute;
		top: 6px;
		right: 6px;
		background: rgb(var(--color-primary-500));
		color: #fff;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 3px;
		line-height: 1.3;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
	}

	.collection-label {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 16px 6px 5px;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
		color: rgba(255, 255, 255, 0.85);
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* ── Title ── */

	.card-title {
		font-size: 0.85rem;
		color: inherit;
		line-height: 1.4;
		margin-top: 6px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
