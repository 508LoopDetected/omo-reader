<script lang="ts">
	import type { Component } from 'svelte';
	import { url, match } from './router.js';

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
		m.route.load().then((mod) => {
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
	<p class="has-text-grey has-text-centered py-6">Page not found.</p>
{/if}
