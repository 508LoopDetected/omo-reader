<script lang="ts">
	import type { Chapter } from '@omo/core';

	interface Props {
		variants: Chapter[];
		selected: string;
		onselect: (chapterId: string) => void;
	}

	let { variants, selected, onselect }: Props = $props();
</script>

{#if variants.length > 1}
	<div class="variant-tabs">
		{#each variants as v}
			<button
				class="variant-tab"
				class:active={v.id === selected}
				onclick={() => onselect(v.id)}
			>
				{v.variant || 'Default'}
			</button>
		{/each}
	</div>
{/if}

<style>
	.variant-tabs {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	.variant-tab {
		padding: 4px 10px;
		border: 1px solid var(--layer-border-subtle);
		border-radius: 3px;
		background: none;
		color: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.variant-tab:hover {
		border-color: var(--color-primary-500);
		color: var(--color-primary-500);
	}

	.variant-tab.active {
		background: var(--color-primary-500);
		border-color: var(--color-primary-500);
		color: #fff;
	}
</style>
