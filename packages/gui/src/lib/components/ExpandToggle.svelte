<script lang="ts">
	interface Props {
		expanded: boolean;
		atBottom?: boolean;
		onclick: () => void;
	}

	let { expanded, atBottom = false, onclick }: Props = $props();
</script>

<div class="expand-area" class:flipped={expanded} class:at-bottom={atBottom}>
	<div class="expand-fade"></div>
	<button class="expand-btn" {onclick}>
		<span class="expand-label">{expanded ? 'less' : 'more'}</span>
		<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" class="expand-caret">
			<path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
		</svg>
	</button>
</div>

<style>
	.expand-area {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		z-index: 2;
		height: 100px;
		pointer-events: none;
	}

	.expand-fade {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, var(--body-background-color) 10%, transparent 100%);
		transition: opacity 0.3s ease;
	}

	:global(.dark) .expand-fade {
		background: linear-gradient(to top, var(--body-background-color-dark, var(--body-background-color)) 40%, transparent 100%);
		opacity: 0.7;
	}

	.expand-btn {
		position: relative;
		z-index: 1;
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 10px;
		border: none;
		border-radius: 5px 5px 0 0;
		background: var(--color-primary-500);
		color: #fff;
		cursor: pointer;
		transition: background 0.15s ease, filter 0.15s ease;
	}

	.expand-btn:hover {
		filter: brightness(1.15);
	}

	.expand-btn:active {
		filter: brightness(0.95);
	}

	.expand-label {
		font-size: 0.6rem;
		line-height: normal;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.expand-caret {
		transition: transform 0.3s ease;
	}

	.expand-area.flipped .expand-caret {
		transform: rotate(180deg);
	}

	.expand-area.flipped .expand-fade,
	.expand-area.at-bottom .expand-fade {
		opacity: 0;
	}
</style>
