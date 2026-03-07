<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="grid grid-cols-[repeat(auto-fill,minmax(max(140px,calc((100%-5*16px)/6)),1fr))] gap-4">
	{@render children()}
</div>
