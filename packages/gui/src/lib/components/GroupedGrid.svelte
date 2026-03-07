<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		title,
		count,
		titleClass = '',
		children,
	}: {
		title: string;
		count?: number;
		titleClass?: string;
		children: Snippet;
	} = $props();
</script>

<div class="mb-6">
	<div class="flex items-center gap-2 mb-3 pb-2 border-b border-surface-200-800">
		<h3 class="text-base font-semibold {titleClass === 'muted' ? 'text-surface-500' : ''}">{title}</h3>
		{#if count !== undefined}
			<span class="badge preset-tonal-surface text-xs">{count}</span>
		{/if}
	</div>
	{@render children()}
</div>
