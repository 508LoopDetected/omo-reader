<script lang="ts">
	import type { ReaderMode, ReadingDirection } from '@omo/core';

	interface Props {
		visible: boolean;
		currentPage: number;
		totalPages: number;
		mode: ReaderMode;
		direction: ReadingDirection;
		spreadOffset: boolean;
		workTitle: string;
		chapterTitle: string;
		hasPrevChapter: boolean;
		hasNextChapter: boolean;
		internalChapters?: { title: string; pageIndex: number }[];
		onPageChange: (page: number) => void;
		onModeChange: (mode: ReaderMode) => void;
		onDirectionChange: (direction: ReadingDirection) => void;
		onOffsetChange: (offset: boolean) => void;
		onPrevChapter: () => void;
		onNextChapter: () => void;
		onClose: () => void;
	}

	let {
		visible, currentPage, totalPages, mode, direction, spreadOffset,
		workTitle, chapterTitle, hasPrevChapter, hasNextChapter,
		internalChapters,
		onPageChange, onModeChange, onDirectionChange, onOffsetChange,
		onPrevChapter, onNextChapter, onClose,
	}: Props = $props();

	function handleSlider(e: Event) {
		const target = e.target as HTMLInputElement;
		onPageChange(parseInt(target.value));
	}

	function cycleMode() {
		const modes: ReaderMode[] = ['spread', 'single', 'vertical'];
		const idx = modes.indexOf(mode);
		onModeChange(modes[(idx + 1) % modes.length]);
	}

	let currentInternalChapter = $derived.by(() => {
		if (!internalChapters || internalChapters.length === 0) return null;
		let current: { title: string; pageIndex: number } | null = null;
		for (const ic of internalChapters) {
			if (ic.pageIndex <= currentPage) current = ic;
			else break;
		}
		return current;
	});
</script>

{#if visible}
	<div class="reader-controls">
		<div class="controls-top">
			<button class="back-button" onclick={onClose} aria-label="Back">
				<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
					<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
				</svg>
			</button>
			<div class="title-info">
				<div class="work-title">{workTitle}</div>
				<div class="chapter-title">
					{chapterTitle}
					{#if currentInternalChapter}
						<span class="internal-indicator"> &middot; {currentInternalChapter.title}</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="controls-bottom">
			<div class="chapter-nav-row">
				<button class="ch-nav-btn" onclick={onPrevChapter} disabled={!hasPrevChapter} title="Previous chapter">
					<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
					Prev
				</button>
				<div class="slider-row">
					<span class="page-num">{currentPage + 1}</span>
					<div class="slider-container">
						<input
							type="range"
							min="0"
							max={totalPages - 1}
							value={currentPage}
							oninput={handleSlider}
							class="page-slider"
							style={direction === 'rtl' ? 'direction: rtl' : ''}
						/>
						{#if internalChapters && internalChapters.length > 0 && totalPages > 1}
							<div class="tick-marks">
								{#each internalChapters as ic}
									{@const pct = direction === 'rtl'
										? (1 - ic.pageIndex / (totalPages - 1)) * 100
										: (ic.pageIndex / (totalPages - 1)) * 100}
									<button
										class="tick-mark"
										style="left: {pct}%"
										title={ic.title}
										onclick={() => onPageChange(ic.pageIndex)}
									></button>
								{/each}
							</div>
						{/if}
					</div>
					<span class="page-num">{totalPages}</span>
				</div>
				<button class="ch-nav-btn" onclick={onNextChapter} disabled={!hasNextChapter} title="Next chapter">
					Next
					<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
				</button>
			</div>

			<div class="button-row">
				<button class="control-btn" onclick={cycleMode} title="Reading mode">
					{#if mode === 'spread'}
						<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 5v14h8V5H3zm10 0v14h8V5h-8z"/></svg>
					{:else if mode === 'single'}
						<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 3h12v18H6z"/></svg>
					{:else}
						<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 2h8v6H8zm0 8h8v6H8zm0 8h8v6H8z"/></svg>
					{/if}
					<span>{mode}</span>
				</button>

				<button
					class="control-btn"
					onclick={() => onDirectionChange(direction === 'rtl' ? 'ltr' : 'rtl')}
					title="Reading direction"
				>
					{#if direction === 'rtl'}
						<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 6l-6 6 6 6V6z"/></svg>
					{:else}
						<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 6v12l6-6-6-6z"/></svg>
					{/if}
					<span>{direction.toUpperCase()}</span>
				</button>

				{#if mode === 'spread'}
					<button
						class="control-btn"
						class:active={spreadOffset}
						onclick={() => onOffsetChange(!spreadOffset)}
						title="Offset (cover page solo)"
					>
						<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
							<path d="M3 5v14h5V5H3zm7 0v14h5V5h-5zm7 0v14h4V5h-4z"/>
						</svg>
						<span>Offset</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.reader-controls {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 100;
	}

	.controls-top {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: linear-gradient(to bottom, rgba(0,0,0,0.85), transparent);
		pointer-events: auto;
	}

	.back-button {
		color: #fff;
		display: flex;
		align-items: center;
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px;
	}

	.title-info { overflow: hidden; }

	.work-title {
		font-size: 0.9rem;
		color: #fff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.chapter-title {
		font-size: 0.75rem;
		color: #aaa;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.internal-indicator {
		color: rgb(var(--color-primary-400));
	}

	.controls-bottom {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 16px;
		background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
		pointer-events: auto;
	}

	.chapter-nav-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}

	.ch-nav-btn {
		display: flex;
		align-items: center;
		gap: 2px;
		background: none;
		border: none;
		color: #aaa;
		cursor: pointer;
		font-size: 0.75rem;
		white-space: nowrap;
		padding: 4px;
		transition: color 0.15s;
	}

	.ch-nav-btn:hover:not(:disabled) { color: #fff; }
	.ch-nav-btn:disabled { opacity: 0.3; cursor: default; }

	.slider-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
	}

	.slider-container {
		position: relative;
		flex: 1;
	}

	.page-num {
		color: #aaa;
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
		min-width: 2em;
		text-align: center;
	}

	.page-slider {
		width: 100%;
		accent-color: rgb(var(--color-primary-500));
	}

	.tick-marks {
		position: absolute;
		top: 0;
		left: 8px;
		right: 8px;
		height: 100%;
		pointer-events: none;
	}

	.tick-mark {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 3px;
		height: 12px;
		background: rgb(var(--color-primary-400));
		border: none;
		border-radius: 1px;
		cursor: pointer;
		pointer-events: auto;
		padding: 0;
		opacity: 0.7;
		transition: opacity 0.15s;
	}

	.tick-mark:hover { opacity: 1; height: 16px; }

	.button-row {
		display: flex;
		justify-content: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.control-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		background: rgba(255,255,255,0.1);
		border: 1px solid rgba(255,255,255,0.2);
		color: #ccc;
		padding: 6px 12px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		transition: background 0.15s;
	}

	.control-btn:hover { background: rgba(255,255,255,0.2); }

	.control-btn.active {
		background: rgba(124, 92, 191, 0.4);
		border-color: rgba(124, 92, 191, 0.6);
		color: #d4c4f0;
	}

	.control-btn span { text-transform: capitalize; }
</style>
