<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
	{@render children()}
</div>
