<script lang="ts">
	const api = (globalThis as any).electronAPI;
	const isDesktop = !!api;

	let isFullscreen = $state(!!document.fullscreenElement);
	let isMaximized = $state(false);

	function toggleFullscreen() {
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			document.documentElement.requestFullscreen();
		}
	}

	$effect(() => {
		function onFsChange() {
			isFullscreen = !!document.fullscreenElement;
		}
		document.addEventListener('fullscreenchange', onFsChange);
		return () => document.removeEventListener('fullscreenchange', onFsChange);
	});

	// Listen for maximize state changes from Electron
	$effect(() => {
		if (!api) return;
		api.isMaximized().then((v: boolean) => isMaximized = v);
		api.onMaximizedChange((v: boolean) => isMaximized = v);
	});

	function handleMinimize() {
		api.minimize();
	}

	function handleMaximize() {
		isMaximized = !isMaximized;
		api.toggleMaximize();
	}

	function handleClose() {
		api.close();
	}
</script>

{#if !isFullscreen}
	{#if isDesktop}
		<div class="drag-surface"></div>
	{/if}

	<div class="titlebar-panel">
		<button class="tb-btn" onclick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
			{#if isFullscreen}
				<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
			{:else}
				<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
			{/if}
		</button>

		{#if isDesktop}
			<div class="tb-separator"></div>

			<button class="tb-btn" onclick={handleMinimize} title="Minimize">
				<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 13h12v-2H6z"/></svg>
			</button>

			<button class="tb-btn" onclick={handleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
				{#if isMaximized}
					<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 4v2h8v8h2V4H8zm-2 4v12h12V8H6zm10 10H8V10h8v8z"/></svg>
				{:else}
					<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6z"/></svg>
				{/if}
			</button>

			<button class="tb-btn tb-close" onclick={handleClose} title="Close">
				<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
			</button>
		{/if}
	</div>
{/if}

<style>
	.drag-surface {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: var(--titlebar-height, 38px);
		z-index: 9998;
		-webkit-app-region: drag;
	}

	.titlebar-panel {
		position: fixed;
		top: 8px;
		right: 10px;
		z-index: 9999;
		display: flex;
		align-items: center;
		gap: 1px;
		padding: 3px;
		border-radius: 10px;
		background: rgba(30, 30, 46, 0.75);
		border: 1px solid rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		opacity: 0.6;
		transition: opacity 0.2s;
		-webkit-app-region: no-drag;
	}

	.titlebar-panel:hover {
		opacity: 1;
	}

	:global(html.light) .titlebar-panel {
		background: rgba(240, 240, 244, 0.8);
		border-color: rgba(0, 0, 0, 0.1);
	}

	.tb-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 26px;
		border: none;
		border-radius: 7px;
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.tb-btn:hover {
		background: rgba(128, 128, 128, 0.2);
		color: var(--text-primary);
	}

	.tb-close:hover {
		background: rgba(232, 17, 35, 0.9);
		color: #fff;
	}

	.tb-separator {
		width: 1px;
		height: 16px;
		margin: 0 2px;
		background: rgba(128, 128, 128, 0.3);
	}
</style>
