<script lang="ts">
	import type { Snippet } from 'svelte';
	import ExpandToggle from '$lib/components/ExpandToggle.svelte';

	interface Props {
		/** Which pane is active — drives the crossfade */
		mode: 'stats' | 'chapter';
		/** Drives cover-section collapse on the parent sidebar */
		expanded: boolean;
		onExpandChange: (expanded: boolean) => void;
		stats: Snippet;
		chapter: Snippet;
	}

	let { mode, expanded, onExpandChange, stats, chapter }: Props = $props();

	let contentEl = $state<HTMLDivElement>();
	let atScrollBottom = $state(false);

	// Keep chapter content in DOM during fade-out (matches 0.3s opacity transition)
	let renderChapter = $state(false);
	let prevMode: 'stats' | 'chapter' | null = null;

	$effect(() => {
		const isInit = prevMode === null;
		const changed = mode !== prevMode;
		prevMode = mode;

		if (mode === 'chapter') {
			renderChapter = true;
		} else if (changed && !isInit) {
			const timer = setTimeout(() => { renderChapter = false; }, 350);
			return () => clearTimeout(timer);
		}

		// Reset expand + scroll on mode switch (not on initial mount)
		if (changed && !isInit) {
			onExpandChange(false);
			atScrollBottom = false;
			if (contentEl) contentEl.scrollTop = 0;
		}
	});

	function handleScroll() {
		if (!contentEl) return;
		const { scrollTop, scrollHeight, clientHeight } = contentEl;
		atScrollBottom = scrollTop + clientHeight >= scrollHeight - 4;
	}

	function toggleExpand() {
		onExpandChange(!expanded);
	}
</script>

<div class="sidebar-pane">
	<div class="pane-crossfade">
		<div class="crossfade-layer" class:active={mode === 'chapter'}>
			{#if renderChapter}
				<div class="pane-content-wrap" class:is-expanded={expanded}>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="pane-content" bind:this={contentEl} onscroll={handleScroll}>
						{@render chapter()}
					</div>
					<ExpandToggle {expanded} atBottom={atScrollBottom} onclick={toggleExpand} />
				</div>
			{/if}
		</div>
		<div class="crossfade-layer" class:active={mode === 'stats'}>
			<div class="pane-content-wrap" class:is-expanded={expanded}>
				<div class="pane-content">
					{@render stats()}
				</div>
				<ExpandToggle {expanded} onclick={toggleExpand} />
			</div>
		</div>
	</div>
</div>

<style>
	.sidebar-pane {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		padding: 0 2px;
		display: flex;
		flex-direction: column;
	}

	.pane-crossfade {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.pane-crossfade > .crossfade-layer {
		position: absolute;
		inset: 0;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.3s ease;
	}

	.pane-crossfade > .crossfade-layer.active {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		opacity: 1;
		pointer-events: auto;
	}

	.pane-content-wrap {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		transition: padding-top 0.4s ease;
	}

	.pane-content-wrap.is-expanded {
		padding-top: 30px;
	}

	.pane-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		transition: overflow 0s 0.4s;
	}

	.pane-content-wrap.is-expanded .pane-content {
		overflow-y: auto;
		scrollbar-width: none;
	}

	.pane-content-wrap.is-expanded .pane-content::-webkit-scrollbar {
		display: none;
	}
</style>
