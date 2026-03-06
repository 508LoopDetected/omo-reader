<script lang="ts">
	import PageImage from './PageImage.svelte';

	interface Page {
		url: string;
	}

	interface Props {
		pages: Page[];
		currentPage: number;
		onPageChange: (page: number) => void;
		onToggleControls: () => void;
	}

	let { pages, currentPage, onPageChange, onToggleControls }: Props = $props();

	let container: HTMLDivElement;

	function handleScroll() {
		if (!container) return;
		const children = container.children;
		const containerTop = container.scrollTop;
		const containerHeight = container.clientHeight;
		const middle = containerTop + containerHeight / 2;

		for (let i = 0; i < children.length; i++) {
			const child = children[i] as HTMLElement;
			const childTop = child.offsetTop;
			const childBottom = childTop + child.offsetHeight;
			if (middle >= childTop && middle < childBottom) {
				if (i !== currentPage) onPageChange(i);
				break;
			}
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="vertical-view" bind:this={container} onscroll={handleScroll} onclick={onToggleControls}>
	{#each pages as page, i}
		<div class="vertical-page">
			<PageImage src={page.url} alt="Page {i + 1}" />
		</div>
	{/each}
</div>

<style>
	.vertical-view {
		width: 100%;
		height: 100%;
		overflow-y: auto;
		background: #000;
	}

	.vertical-page {
		width: 100%;
		max-width: 800px;
		margin: 0 auto;
	}

	.vertical-page :global(img) {
		width: 100%;
		height: auto;
	}
</style>
