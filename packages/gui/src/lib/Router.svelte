<script lang="ts">
	import type { Component } from 'svelte';
	import { url, match, navGeneration } from './router.js';

	let currentPath = $derived(url.pathname);
	let routeMatch = $derived(match(currentPath));

	let Page = $state<Component | null>(null);
	let pageParams = $state<Record<string, string>>({});
	let pageKey = $state('');

	$effect(() => {
		const m = routeMatch;
		if (!m) {
			Page = null;
			pageParams = {};
			pageKey = '';
			return;
		}
		const path = currentPath;
		const gen = navGeneration;
		m.route.load().then((mod) => {
			// Discard if a newer navigation has happened since this load started
			if (gen !== navGeneration) return;
			Page = mod.default;
			pageParams = m.params;
			pageKey = path;
		});
	});
</script>

{#if Page}
	{#key pageKey}
		<Page params={pageParams} searchParams={url.searchParams}></Page>
	{/key}
{:else}
	<p class="text-surface-500 text-center py-8">Page not found.</p>
{/if}
