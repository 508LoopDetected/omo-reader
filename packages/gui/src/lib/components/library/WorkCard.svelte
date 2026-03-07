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

<a {href} class="block no-underline transition-transform hover:scale-[1.02]" class:opacity-40={unavailable} class:pointer-events-none={unavailable}>
	<CoverImage url={coverUrl} {sourceId} {workId} alt={title} fallbackChar={title.charAt(0)}>
		{#snippet overlay()}
			{#if unavailable}
				<div class="badge-label bg-surface-500/85 text-[0.6rem]">Disconnected</div>
			{:else if nsfw}
				<div class="badge-label bg-error-500">18+</div>
			{:else if badge}
				<div class="badge-label" style:background={badgeColor ?? 'rgb(var(--color-primary-500))'}>{badge}</div>
			{/if}
		{/snippet}
	</CoverImage>
	<div class="text-[0.85rem] text-surface-800 dark:text-surface-200 leading-tight mt-1.5 line-clamp-2">{title}</div>
	{#if subtitle}
		<div class="text-xs text-surface-500 mt-0.5">{subtitle}</div>
	{/if}
</a>

<style>
	.badge-label {
		position: absolute;
		top: 6px;
		right: 6px;
		color: #fff;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 4px;
		line-height: 1.3;
	}
</style>
