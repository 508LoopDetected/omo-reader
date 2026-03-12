<script lang="ts">
	interface TrackerState {
		status: 'active' | 'paused' | 'completed';
		trackedSeconds: number;
		activeAt: string | null;
		startedAt: string | null;
		completedAt: string | null;
	}

	interface Props {
		sourceId: string;
		workId: string;
		chaptersRead: number;
		chaptersTotal: number;
		rating: number | null;
		readingActivity: { date: string; pagesRead: number }[];
		tracker: TrackerState | null;
		onTrackerToggle: () => void;
		onTrackerDelete: () => void;
		onRatingChange: (rating: number | null) => void;
		communityScore?: number | null;
		provider?: string | null;
		externalUrl?: string | null;
	}

	let {
		sourceId, workId,
		chaptersRead, chaptersTotal,
		rating, readingActivity,
		tracker, onTrackerToggle, onTrackerDelete,
		onRatingChange,
		communityScore = null,
		provider = null,
		externalUrl = null,
	}: Props = $props();

	let providerLabel = $derived(
		provider === 'mangaupdates' ? 'MangaUpdates'
		: provider === 'anilist' ? 'AniList'
		: provider === 'comicvine' ? 'Comic Vine'
		: null
	);

	let hoverStar = $state<number | null>(null);
	let ratingOpen = $state(false);

	function toggleRating(e: MouseEvent) {
		e.stopPropagation();
		ratingOpen = !ratingOpen;
	}

	function handleRatingSelect(star: number) {
		const newRating = star * 2;
		if (rating === newRating) onRatingChange(null);
		else onRatingChange(newRating);
		ratingOpen = false;
	}

	$effect(() => {
		if (!ratingOpen) return;
		function close() { ratingOpen = false; }
		window.addEventListener('click', close);
		return () => window.removeEventListener('click', close);
	});

	// ── Completion ring ──

	const RING_R = 34;
	const RING_C = Math.PI * 2 * RING_R;

	let completionPct = $derived(chaptersTotal > 0 ? chaptersRead / chaptersTotal : 0);
	let ringOffset = $derived(RING_C * (1 - completionPct));

	// ── Star rating ──

	let displayRating = $derived(hoverStar ?? (rating !== null ? rating / 2 : 0));

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

	// ── Tracker live time ──

	let tick = $state(0);
	$effect(() => {
		if (!tracker || tracker.status !== 'active') return;
		const interval = setInterval(() => tick++, 1000);
		return () => clearInterval(interval);
	});

	let trackedTime = $derived.by(() => {
		if (!tracker) return 0;
		void tick; // reactivity trigger
		let total = tracker.trackedSeconds;
		if (tracker.status === 'active' && tracker.activeAt) {
			total += Math.floor((Date.now() - new Date(tracker.activeAt).getTime()) / 1000);
		}
		return Math.max(0, total);
	});

	let confirmingDelete = $state(false);

	function handleDeleteClick() {
		if (confirmingDelete) {
			onTrackerDelete();
			confirmingDelete = false;
		} else {
			confirmingDelete = true;
			setTimeout(() => confirmingDelete = false, 3000);
		}
	}

	function formatDuration(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		if (h > 0) return `${h}h ${m}m`;
		if (m > 0) return `${m}m ${s}s`;
		return `${s}s`;
	}
</script>

<div class="work-stats">
	<div class="stats-content">
		<!-- Top row: completion ring + tracker + star rating -->
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

			<div class="tracker-section">
				<button class="tracker-toggle" class:active={tracker?.status === 'active'} class:completed={tracker?.status === 'completed'} onclick={onTrackerToggle}>
					{#if !tracker || tracker.status !== 'active'}
						<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
					{:else}
						<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
					{/if}
				</button>
				<div class="tracker-info">
					<span class="tracker-time" class:ticking={tracker?.status === 'active'}>
						{#if !tracker}Start Tracking
						{:else if tracker.status === 'active'}Tracking
						{:else if tracker.status === 'completed'}Completed
						{:else}Paused
						{/if}
					</span>
					<span class="tracker-status">{tracker ? formatDuration(trackedTime) : '0s'}</span>
				</div>
				{#if tracker}
					<button class="tracker-delete" class:confirming={confirmingDelete} onclick={handleDeleteClick} title={confirmingDelete ? 'Click again to confirm' : 'Remove tracker'}>
						{#if confirmingDelete}
							<span class="confirm-label">?</span>
						{:else}
							<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
						{/if}
					</button>
				{/if}
			</div>

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="rating-section" onclick={toggleRating}>
				<svg viewBox="0 0 24 24" class="rating-star-icon" class:has-rating={rating !== null}>
					<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
				</svg>
				<div class="rating-display">
					<span class="rating-num">{rating !== null ? (rating / 2).toFixed(1) : '--'}</span>
					<span class="rating-max">/ 5</span>
				</div>
				{#if communityScore !== null && providerLabel}
					<div class="community-score">
						{#if externalUrl}
							<a href={externalUrl} target="_blank" rel="noopener noreferrer" class="community-link" onclick={(e) => e.stopPropagation()}>
								<span class="community-badge">{providerLabel}</span>
								<span class="community-value">{(communityScore / 10).toFixed(1)}<span class="community-max">/10</span></span>
							</a>
						{:else}
							<span class="community-badge">{providerLabel}</span>
							<span class="community-value">{(communityScore / 10).toFixed(1)}<span class="community-max">/10</span></span>
						{/if}
					</div>
				{/if}

				{#if ratingOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="rating-dropdown" onclick={(e) => e.stopPropagation()}>
						<span class="rating-sub">{rating !== null ? 'rated' : 'unrated'}</span>
						<div class="stars" onmouseleave={() => hoverStar = null}>
							{#each [1, 2, 3, 4, 5] as star}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="star-wrap"
									onmousemove={(e) => handleStarHalf(star, e)}
									onclick={() => handleRatingSelect(hoverStar ?? star)}
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
						{#if rating !== null}
							<button class="rating-clear" onclick={() => { onRatingChange(null); ratingOpen = false; }}>Clear</button>
						{/if}
					</div>
				{/if}
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

	/* ── Rating (compact number + dropdown) ── */

	.rating-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		cursor: pointer;
		position: relative;
		flex-shrink: 0;
		padding: 4px 8px;
	}

	.rating-star-icon {
		width: 22px;
		height: 22px;
		fill: var(--color-surface-500);
		opacity: 0.3;
		transition: all var(--transition-fast);
	}

	.rating-star-icon.has-rating {
		fill: var(--color-tertiary-400);
		opacity: 1;
	}

	.rating-section:hover .rating-star-icon {
		opacity: 0.8;
		transform: scale(1.1);
	}

	.rating-display {
		display: flex;
		align-items: baseline;
		gap: 2px;
		line-height: 1;
	}

	.rating-num {
		font-size: 1.4rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-tertiary-400);
		margin-right: 2px;
	}

	.rating-max {
		font-size: 0.65rem;
		font-weight: 500;
		color: inherit;
		opacity: 0.4;
	}

	.rating-sub {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
		color: inherit;
		line-height: 1;
	}

	/* ── Rating dropdown ── */

	.rating-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		background: color-mix(in oklch, var(--layer-raised) 95%, transparent);
		backdrop-filter: blur(20px) saturate(150%);
		-webkit-backdrop-filter: blur(20px) saturate(150%);
		border: 1px solid var(--layer-border);
		border-radius: 8px;
		padding: 8px 6px;
		z-index: 50;
		box-shadow: var(--shadow-overlay);
		animation: popIn 0.15s ease-out;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}

	@keyframes popIn {
		from { opacity: 0; transform: translateY(-4px) scale(0.97); }
		to { opacity: 1; transform: translateY(0) scale(1); }
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
		width: 20px;
		height: 20px;
	}

	.star-half {
		transition: fill 0.15s ease, opacity 0.15s ease;
	}

	.star-empty {
		opacity: 0.25;
	}

	.rating-clear {
		border: none;
		background: color-mix(in oklch, var(--color-error-500) 10%, transparent);
		color: var(--color-error-500);
		font-size: 0.65rem;
		font-weight: 600;
		padding: 3px 10px;
		border-radius: 4px;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.rating-clear:hover {
		background: color-mix(in oklch, var(--color-error-500) 20%, transparent);
	}

	.community-score {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.community-link {
		display: flex;
		align-items: center;
		gap: 4px;
		text-decoration: none !important;
		color: inherit !important;
		transition: opacity var(--transition-fast);
	}

	.community-link:hover {
		opacity: 0.8;
	}

	.community-badge {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 1px 4px;
		border-radius: 3px;
		background: color-mix(in oklch, var(--color-primary-500) 15%, transparent);
		color: var(--color-primary-400);
	}

	.community-value {
		font-size: 0.65rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: inherit;
	}

	.community-max {
		opacity: 0.4;
		font-weight: 400;
	}

	/* ── Tracker (center column) ── */

	.tracker-section {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 6px;
		background: color-mix(in oklch, var(--color-surface-50-950) 8%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid color-mix(in oklch, var(--color-surface-50-950) 10%, transparent);
		border-radius: 8px;
		padding: 8px 10px;
		flex: 1;
	}

	.tracker-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: all var(--transition-fast);
		flex-shrink: 0;
		background: color-mix(in oklch, var(--layer-border) 40%, transparent);
		color: inherit;
	}

	.tracker-toggle:hover {
		background: color-mix(in oklch, var(--layer-border) 70%, transparent);
	}

	.tracker-toggle.active {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
	}

	.tracker-toggle.active:hover {
		background: var(--color-primary-400);
	}

	.tracker-toggle.completed {
		background: var(--color-success-500);
		color: #fff;
	}

	.tracker-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.tracker-time {
		font-size: 0.82rem;
		font-weight: 700;
		color: inherit;
		line-height: 1.2;
	}

	.tracker-time.ticking {
		color: var(--color-primary-400);
	}

	.tracker-status {
		font-size: 0.55rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: inherit;
		line-height: 1;
	}

	.tracker-delete {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border: none;
		border-radius: 4px;
		background: none;
		color: inherit;
		cursor: pointer;
		opacity: 0.3;
		transition: all var(--transition-fast);
	}

	.tracker-delete:hover {
		opacity: 1;
		color: var(--color-error-500);
		background: color-mix(in oklch, var(--color-error-500) 10%, transparent);
	}

	.tracker-delete.confirming {
		opacity: 1;
		color: var(--color-error-500);
		background: color-mix(in oklch, var(--color-error-500) 15%, transparent);
		animation: pulse-confirm 0.6s ease infinite alternate;
	}

	@keyframes pulse-confirm {
		from { opacity: 0.7; }
		to { opacity: 1; }
	}

	.confirm-label {
		font-size: 0.65rem;
		font-weight: 700;
		line-height: 1;
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
