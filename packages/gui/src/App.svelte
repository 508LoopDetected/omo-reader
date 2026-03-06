<script lang="ts">
	import Layout from './Layout.svelte';
	import Router from '$lib/Router.svelte';
	import { goto } from '$lib/router.js';

	function handleClick(e: MouseEvent) {
		const anchor = (e.target as Element).closest('a');
		if (!anchor) return;
		const href = anchor.getAttribute('href');
		if (!href || href.startsWith('http') || href.startsWith('//') || anchor.hasAttribute('download') || anchor.target === '_blank') return;
		e.preventDefault();
		goto(href);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div onclick={handleClick}>
	<Layout>
		{#snippet children()}
			<Router />
		{/snippet}
	</Layout>
</div>
