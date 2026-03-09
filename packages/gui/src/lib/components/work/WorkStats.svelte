<script lang="ts">
	interface Props {
		sourceId: string;
		workId: string;
		chaptersRead: number;
		chaptersTotal: number;
		rating: number | null;
		readingActivity: { date: string; pagesRead: number }[];
		onRatingChange: (rating: number | null) => void;
	}

	let {
		sourceId, workId,
		chaptersRead, chaptersTotal,
		rating, readingActivity,
		onRatingChange,
	}: Props = $props();

	let hoverStar = $state<number | null>(null);

	// ── Completion ring ──

	const RING_R = 34;
	const RING_C = Math.PI * 2 * RING_R;

	let completionPct = $derived(chaptersTotal > 0 ? chaptersRead / chaptersTotal : 0);
	let ringOffset = $derived(RING_C * (1 - completionPct));

	// ── Star rating ──

	let displayRating = $derived(hoverStar ?? (rating !== null ? rating / 2 : 0));

	function handleStarClick(star: number) {
		const newRating = star * 2;
		if (rating === newRating) {
			onRatingChange(null);
		} else {
			onRatingChange(newRating);
		}
	}

	function handleStarHalf(star: number, e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const isLeft = e.clientX - rect.left < rect.width / 2;
		hoverStar = isLeft ? star - 0.5 : star;
	}

	// ── Heatmap ──

	const HEATMAP_WEEKS = 13;
	const HEATMAP_DAYS = HEATMAP_WEEKS * 7;

	let activityMap = $derived.by(() => {
		const map = new Map<string, number>();
		for (const entry of readingActivity) {
			map.set(entry.date, entry.pagesRead);
		}
		return map;
	});

	let heatmapCells = $derived.by(() => {
		const cells: { date: string; value: number; col: number; row: number }[] = [];
		const today = new Date();
		const dayOfWeek = today.getDay();

		for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(d.getDate() - i);
			const dateStr = d.toISOString().slice(0, 10);
			const daysFromEnd = i;
			const totalOffset = dayOfWeek + daysFromEnd;
			const col = HEATMAP_WEEKS - 1 - Math.floor(totalOffset / 7);
			const row = d.getDay();
			cells.push({
				date: dateStr,
				value: activityMap.get(dateStr) ?? 0,
				col,
				row,
			});
		}
		return cells;
	});

	let maxActivity = $derived(Math.max(1, ...readingActivity.map(a => a.pagesRead)));

	function heatLevel(value: number): number {
		if (value === 0) return 0;
		const ratio = value / maxActivity;
		if (ratio <= 0.25) return 1;
		if (ratio <= 0.5) return 2;
		if (ratio <= 0.75) return 3;
		return 4;
	}

	let monthLabels = $derived.by(() => {
		const labels: { text: string; col: number }[] = [];
		const today = new Date();
		let lastMonth = -1;
		for (let w = 0; w < HEATMAP_WEEKS; w++) {
			const daysBack = (HEATMAP_WEEKS - 1 - w) * 7 + today.getDay();
			const d = new Date(today);
			d.setDate(d.getDate() - daysBack);
			if (d.getMonth() !== lastMonth) {
				lastMonth = d.getMonth();
				labels.push({ text: d.toLocaleDateString('en', { month: 'short' }), col: w });
			}
		}
		return labels;
	});

	let totalPagesRead = $derived(readingActivity.reduce((sum, a) => sum + a.pagesRead, 0));
	let activeDays = $derived(readingActivity.filter(a => a.pagesRead > 0).length);
</script>

<div class="work-stats">
	<div class="stats-content">
		<!-- Top row: completion ring + star rating -->
		<div class="stats-top">
			<div class="completion-section">
				<svg viewBox="0 0 80 80" class="ring-svg">
					<circle cx="40" cy="40" r={RING_R} fill="none" stroke="var(--color-surface-500)" stroke-width="6" stroke-opacity="0.15" />
					<circle
						cx="40" cy="40" r={RING_R}
						fill="none"
						stroke="url(#ring-gradient)"
						stroke-width="6"
						stroke-linecap="round"
						stroke-dasharray={RING_C}
						stroke-dashoffset={ringOffset}
						transform="rotate(-90 40 40)"
						class="ring-progress"
					/>
					<defs>
						<linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stop-color="var(--color-primary-400)" />
							<stop offset="100%" stop-color="var(--color-tertiary-500)" />
						</linearGradient>
					</defs>
				</svg>
				<div class="ring-label">
					<span class="ring-count">{chaptersRead}<span class="ring-sep">/</span>{chaptersTotal}</span>
					<span class="ring-sub">read</span>
				</div>
			</div>

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="rating-section" onclick={(e) => e.stopPropagation()}>
				<div class="stars" onmouseleave={() => hoverStar = null}>
					{#if rating !== null}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="star-wrap clear-btn" onclick={() => onRatingChange(null)} title="Clear rating">
							<svg viewBox="0 0 24 24" class="clear-icon">
								<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
								<line x1="7" y1="17" x2="17" y2="7" stroke="currentColor" stroke-width="2"/>
							</svg>
						</div>
					{/if}
					{#each [1, 2, 3, 4, 5] as star}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="star-wrap"
							onmousemove={(e) => handleStarHalf(star, e)}
							onclick={() => handleStarClick(hoverStar ?? star)}
						>
							<svg viewBox="0 0 24 24" class="star-icon">
								<defs>
									<clipPath id="star-left-{star}">
										<rect x="0" y="0" width="12" height="24"/>
									</clipPath>
									<clipPath id="star-right-{star}">
										<rect x="12" y="0" width="12" height="24"/>
									</clipPath>
								</defs>
								<path
									d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
									clip-path="url(#star-left-{star})"
									fill={displayRating >= star - 0.5 ? 'var(--color-tertiary-400)' : 'var(--color-surface-400)'}
									class="star-half"
									class:star-empty={displayRating < star - 0.5}
								/>
								<path
									d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
									clip-path="url(#star-right-{star})"
									fill={displayRating >= star ? 'var(--color-tertiary-400)' : 'var(--color-surface-400)'}
									class="star-half"
									class:star-empty={displayRating < star}
								/>
							</svg>
						</div>
					{/each}
				</div>
				<span class="rating-value">{rating !== null ? (rating / 2).toFixed(1) : 'Unrated'}</span>
			</div>
		</div>

		<!-- Heatmap -->
		<div class="heatmap-section">
			<div class="heatmap-header">
				<span class="heatmap-label">{totalPagesRead.toLocaleString()} pages</span>
				<span class="heatmap-sublabel">{activeDays} active day{activeDays !== 1 ? 's' : ''}</span>
			</div>
			<div class="heatmap-wrap">
				<div class="heatmap-months">
					{#each monthLabels as label}
						<span class="month-label" style="grid-column: {label.col + 1}">{label.text}</span>
					{/each}
				</div>
				<svg
					viewBox="0 0 {HEATMAP_WEEKS * 10} {7 * 10}"
					class="heatmap-svg"
				>
					{#each heatmapCells as cell}
						<rect
							x={cell.col * 10 + 1}
							y={cell.row * 10 + 1}
							width="8"
							height="8"
							rx="2"
							class="heatmap-cell level-{heatLevel(cell.value)}"
						>
							<title>{cell.date}: {cell.value} pages</title>
						</rect>
					{/each}
				</svg>
			</div>
			<div class="heatmap-legend">
				<span class="legend-label">Less</span>
				<span class="legend-cell level-0"></span>
				<span class="legend-cell level-1"></span>
				<span class="legend-cell level-2"></span>
				<span class="legend-cell level-3"></span>
				<span class="legend-cell level-4"></span>
				<span class="legend-label">More</span>
			</div>
		</div>
	</div>

</div>

<style>
	.work-stats {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.stats-content {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 0 0;
	}

	/* ── Reveal (smooth height transition) ── */

	.reveal {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.4s ease;
	}

	.reveal-open {
		grid-template-rows: 1fr;
	}

	.reveal-inner {
		overflow: hidden;
	}

	/* ── Top row ── */

	.stats-top {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	/* ── Completion ring ── */

	.completion-section {
		position: relative;
		flex-shrink: 0;
		width: 64px;
		height: 64px;
	}

	.ring-svg {
		width: 100%;
		height: 100%;
	}

	.ring-progress {
		transition: stroke-dashoffset 0.6s ease;
	}

	.ring-label {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.ring-count {
		font-size: 0.72rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: inherit;
		line-height: 1;
	}

	.ring-sep {
		opacity: 0.4;
		margin: 0 1px;
	}

	.ring-sub {
		font-size: 0.55rem;
		color: inherit;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		line-height: 1;
		margin-top: 2px;
	}

	/* ── Star rating ── */

	.rating-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
	}

	.stars {
		display: flex;
		gap: 1px;
	}

	.star-wrap {
		cursor: pointer;
		padding: 2px;
		transition: transform var(--transition-fast);
	}

	.star-wrap:hover {
		transform: scale(1.15);
	}

	.star-wrap:active {
		transform: scale(0.95);
	}

	.star-icon {
		width: 18px;
		height: 18px;
	}

	.clear-btn {
		color: inherit;
		opacity: 0.4;
	}

	.clear-btn:hover {
		opacity: 1;
		color: var(--color-error-500);
	}

	.clear-icon {
		width: 16px;
		height: 16px;
	}

	.star-half {
		transition: fill 0.15s ease, opacity 0.15s ease;
	}

	.star-empty {
		opacity: 0.25;
	}

	.rating-value {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--color-tertiary-400);
		font-variant-numeric: tabular-nums;
	}

	/* ── Heatmap ── */

	.heatmap-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.heatmap-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.heatmap-label {
		font-size: 0.72rem;
		font-weight: 600;
		color: inherit;
	}

	.heatmap-sublabel {
		font-size: 0.65rem;
		color: inherit;
	}

	.heatmap-wrap {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.heatmap-months {
		display: grid;
		grid-template-columns: repeat(13, 1fr);
		font-size: 0.55rem;
		color: inherit;
		padding-left: 1px;
	}

	.heatmap-svg {
		width: 100%;
		height: auto;
	}

	.heatmap-cell {
		transition: opacity 0.15s ease;
	}

	.heatmap-cell.level-0 { fill: currentColor; opacity: 0.06; }
	.heatmap-cell.level-1 { fill: var(--color-primary-400); opacity: 0.35; }
	.heatmap-cell.level-2 { fill: var(--color-primary-400); opacity: 0.55; }
	.heatmap-cell.level-3 { fill: var(--color-primary-400); opacity: 0.78; }
	.heatmap-cell.level-4 { fill: var(--color-primary-400); }

	/* ── Legend ── */

	.heatmap-legend {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 3px;
		padding-bottom: 8px;
	}

	.legend-label {
		font-size: 0.55rem;
		color: inherit;
	}

	.legend-cell {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}

	.legend-cell.level-0 { background: currentColor; opacity: 0.06; }
	.legend-cell.level-1 { background: var(--color-primary-400); opacity: 0.35; }
	.legend-cell.level-2 { background: var(--color-primary-400); opacity: 0.55; }
	.legend-cell.level-3 { background: var(--color-primary-400); opacity: 0.78; }
	.legend-cell.level-4 { background: var(--color-primary-400); }
</style>
