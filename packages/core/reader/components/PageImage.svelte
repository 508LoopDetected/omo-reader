<script lang="ts">
	interface Props {
		src: string;
		alt?: string;
		onLoad?: (event: { width: number; height: number }) => void;
		class?: string;
	}

	let { src, alt = '', onLoad, class: className = '' }: Props = $props();

	let loaded = $state(false);
	let error = $state(false);

	function handleLoad(e: Event) {
		const img = e.target as HTMLImageElement;
		loaded = true;
		error = false;
		onLoad?.({ width: img.naturalWidth, height: img.naturalHeight });
	}

	function handleError() {
		error = true;
		loaded = false;
	}
</script>

<div class="page-image-wrapper {className}">
	{#if !loaded && !error}
		<div class="page-loading">
			<div class="loader"></div>
		</div>
	{/if}
	{#if error}
		<div class="page-error">
			<span>Failed to load</span>
		</div>
	{/if}
	<img
		{src}
		{alt}
		onload={handleLoad}
		onerror={handleError}
		class:hidden={!loaded}
		draggable="false"
	/>
</div>

<style>
	.page-image-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		position: relative;
	}

	img {
		max-height: 100%;
		max-width: 100%;
		object-fit: contain;
		user-select: none;
	}

	img.hidden {
		display: none;
	}

	.page-loading, .page-error {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 200px;
		min-height: 300px;
		color: #888;
	}

	.loader {
		width: 32px;
		height: 32px;
		border: 3px solid #333;
		border-top-color: #888;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
