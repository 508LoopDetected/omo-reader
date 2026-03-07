<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="card bg-surface-100-900 p-12 text-center rounded-lg">
	{@render children()}
</div>
