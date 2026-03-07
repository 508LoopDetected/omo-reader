<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="flex items-center gap-3 mb-4 flex-wrap">
	{@render children()}
</div>
