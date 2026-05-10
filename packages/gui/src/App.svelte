<script lang="ts">
	import Layout from './Layout.svelte';
	import Router from '$lib/Router.svelte';
	import LoginPage from '$lib/components/LoginPage.svelte';
	import { goto } from '$lib/router.js';
	import { apiFetch } from '$lib/api';

	type AuthState = 'checking' | 'ok' | 'needs-auth';
	let authState = $state<AuthState>('checking');

	$effect(() => {
		// Probe the API once on launch. A 401 means the server has OMO_AUTH_TOKEN
		// set and our locally stored token is missing or stale → show login. Any
		// 2xx means we're authed (or server has auth disabled).
		(async () => {
			try {
				const res = await apiFetch('/api/manifest');
				authState = res.status === 401 ? 'needs-auth' : 'ok';
			} catch {
				// Network errors fall through to the normal app — login won't help.
				authState = 'ok';
			}
		})();
	});

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
	{#if authState === 'needs-auth'}
		<LoginPage />
	{:else if authState === 'ok'}
		<Layout>
			{#snippet children()}
				<Router />
			{/snippet}
		</Layout>
	{/if}
	<!-- 'checking' renders nothing — short flash, avoids a layout flicker -->
</div>
