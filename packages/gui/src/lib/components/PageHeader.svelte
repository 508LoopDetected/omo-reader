<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		title,
		count,
		countLabel = '',
		badge = '',
		actions,
	}: {
		title: string;
		count?: number;
		countLabel?: string;
		badge?: string;
		actions?: Snippet;
	} = $props();
</script>

<div class="flex items-center gap-3 mb-4">
	<h2 class="h4">{title}</h2>
	{#if badge}
		<span class="badge preset-filled-primary-500 text-xs uppercase tracking-wide">{badge}</span>
	{/if}
	{#if count !== undefined}
		<span class="text-sm text-surface-500">{count} {countLabel || 'titles'}</span>
	{/if}
	{#if actions}
		<div class="flex items-center gap-2 ml-auto">
			{@render actions()}
		</div>
	{/if}
</div>
