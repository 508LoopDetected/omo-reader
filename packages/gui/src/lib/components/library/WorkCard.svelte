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
	}

	let { title, coverUrl, sourceId, workId, href, badge, badgeColor, subtitle, nsfw, unavailable }: Props = $props();
</script>

<a {href} class="work-card" class:unavailable data-tilt-hover>
	<CoverImage url={coverUrl} {sourceId} {workId} alt={title} fallbackChar={title.charAt(0)}>
		{#snippet overlay()}
			{#if unavailable}
				<div class="badge disconnected-badge">Disconnected</div>
			{:else if nsfw}
				<div class="badge nsfw-badge">18+</div>
			{:else if badge}
				<div class="badge" style:background={badgeColor}>{badge}</div>
			{/if}
		{/snippet}
	</CoverImage>
	<div class="card-title">{title}</div>
	{#if subtitle}
		<div class="card-subtitle">{subtitle}</div>
	{/if}
</a>

<style>
	.work-card {
		display: block;
		text-decoration: none;
		color: inherit;
		transition: transform 0.15s;
	}


	.badge {
		position: absolute;
		top: 6px;
		right: 6px;
		background: var(--accent, #7c5cbf);
		color: #fff;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 4px;
		line-height: 1.3;
	}

	.nsfw-badge {
		background: #e74c3c;
	}

	.disconnected-badge {
		background: rgba(120, 120, 120, 0.85);
		font-size: 0.6rem;
	}

	.work-card.unavailable {
		opacity: 0.4;
		pointer-events: none;
	}

	.card-title {
		font-size: 0.85rem;
		color: #ddd;
		line-height: 1.3;
		margin-top: 6px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-subtitle {
		font-size: 0.75rem;
		color: var(--text-secondary, #888);
		margin-top: 2px;
	}
</style>
