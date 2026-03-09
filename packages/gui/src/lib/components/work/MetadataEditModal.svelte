<script lang="ts">
	interface Props {
		sourceId: string;
		workId: string;
		localWork: {
			author: string | null;
			artist: string | null;
			description: string | null;
			genres: string[] | null;
			status: string | null;
			coverUrl: string | null;
		};
		onlineMeta: {
			author: string | null;
			artist: string | null;
			description: string | null;
			genres: string[] | null;
			status: string | null;
			coverUrl: string | null;
		} | null;
		overrides: Record<string, 'local' | 'online'> | null;
		onSave: () => void;
		onClose: () => void;
	}

	let { sourceId, workId, localWork, onlineMeta, overrides, onSave, onClose }: Props = $props();

	type FieldKey = 'author' | 'artist' | 'description' | 'genres' | 'status' | 'coverUrl';

	const fields: { key: FieldKey; label: string }[] = [
		{ key: 'author', label: 'Author' },
		{ key: 'artist', label: 'Artist' },
		{ key: 'description', label: 'Description' },
		{ key: 'genres', label: 'Genres' },
		{ key: 'status', label: 'Status' },
		{ key: 'coverUrl', label: 'Cover Art' },
	];

	// Clone overrides into local mutable state
	let fieldOverrides = $state<Record<string, 'local' | 'online' | 'default'>>({});

	$effect(() => {
		const initial: Record<string, 'local' | 'online' | 'default'> = {};
		for (const f of fields) {
			initial[f.key] = overrides?.[f.key] ?? 'default';
		}
		fieldOverrides = initial;
	});

	let saving = $state(false);

	function getLocalValue(key: FieldKey): string | null {
		if (key === 'genres') {
			return localWork.genres?.join(', ') ?? null;
		}
		return localWork[key] ?? null;
	}

	function getOnlineValue(key: FieldKey): string | null {
		if (!onlineMeta) return null;
		if (key === 'genres') {
			return onlineMeta.genres?.join(', ') ?? null;
		}
		return onlineMeta[key] ?? null;
	}

	function truncate(text: string | null, max: number): string {
		if (!text) return '';
		return text.length > max ? text.slice(0, max) + '...' : text;
	}

	function setField(key: string, value: 'local' | 'online' | 'default') {
		fieldOverrides = { ...fieldOverrides, [key]: value };
	}

	async function save() {
		saving = true;
		try {
			// Build overrides object, only include non-default values
			const result: Record<string, string> = {};
			for (const f of fields) {
				const v = fieldOverrides[f.key];
				if (v === 'local' || v === 'online') {
					result[f.key] = v;
				}
			}

			await fetch('/api/metadata/overrides', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sourceId, workId,
					overrides: Object.keys(result).length > 0 ? result : null,
				}),
			});
			onSave();
		} catch (err) {
			console.error('Failed to save metadata overrides:', err);
		} finally {
			saving = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={onClose} onkeydown={handleKeydown}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-content" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h3 class="modal-title">Edit Metadata</h3>
			<button class="modal-close" onclick={onClose} aria-label="Close">
				<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
			</button>
		</div>

		<div class="modal-body">
			{#if !onlineMeta}
				<div class="no-online">No online metadata linked. Link metadata first to compare fields.</div>
			{:else}
				{#each fields as field}
					{@const localVal = getLocalValue(field.key)}
					{@const onlineVal = getOnlineValue(field.key)}
					{@const current = fieldOverrides[field.key] ?? 'default'}
					{@const hasLocal = !!localVal}
					{@const hasOnline = !!onlineVal}
					{@const isCover = field.key === 'coverUrl'}

					<div class="field-row">
						<div class="field-label">{field.label}</div>
						<div class="field-options">
							<button
								class="field-option"
								class:active={current === 'default'}
								onclick={() => setField(field.key, 'default')}
								title="Follow global preference"
							>
								<span class="option-badge">Default</span>
							</button>

							<button
								class="field-option"
								class:active={current === 'local'}
								class:empty={!hasLocal}
								onclick={() => setField(field.key, 'local')}
								disabled={!hasLocal && !hasOnline}
							>
								<span class="option-badge">Local</span>
								{#if isCover && localVal}
									<img src={localVal} alt="" class="cover-preview" />
								{:else}
									<span class="option-value">{truncate(localVal, 80) || 'None'}</span>
								{/if}
							</button>

							<button
								class="field-option"
								class:active={current === 'online'}
								class:empty={!hasOnline}
								onclick={() => setField(field.key, 'online')}
								disabled={!hasOnline && !hasLocal}
							>
								<span class="option-badge">Online</span>
								{#if isCover && onlineVal}
									<img src={onlineVal} alt="" class="cover-preview" />
								{:else}
									<span class="option-value">{truncate(onlineVal, 80) || 'None'}</span>
								{/if}
							</button>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<div class="modal-footer">
			<button class="cancel-btn" onclick={onClose}>Cancel</button>
			<button class="save-btn" onclick={save} disabled={saving || !onlineMeta}>
				{saving ? 'Saving...' : 'Save'}
			</button>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal-content {
		width: 90%;
		max-width: 520px;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		background: var(--layer-raised);
		border: 1px solid var(--layer-border);
		border-radius: 12px;
		box-shadow: var(--shadow-overlay);
		animation: slideUp 0.2s ease-out;
	}

	@keyframes slideUp {
		from { transform: translateY(12px); opacity: 0; }
		to { transform: translateY(0); opacity: 1; }
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px 0;
	}

	.modal-title {
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
	}

	.modal-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 5px;
		background: none;
		color: inherit;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.modal-close:hover {
		background: color-mix(in oklch, var(--layer-border) 40%, transparent);
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.no-online {
		text-align: center;
		font-size: 0.85rem;
		color: inherit;
		opacity: 0.6;
		padding: 24px 0;
	}

	.field-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.field-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: inherit;
		opacity: 0.6;
	}

	.field-options {
		display: flex;
		gap: 4px;
	}

	.field-option {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px 8px;
		border: 1px solid color-mix(in oklch, var(--layer-border) 50%, transparent);
		border-radius: 6px;
		background: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
		transition: all var(--transition-fast);
		min-width: 0;
	}

	.field-option:hover:not(:disabled) {
		background: color-mix(in oklch, var(--layer-border) 20%, transparent);
		border-color: var(--layer-border);
	}

	.field-option.active {
		border-color: var(--color-primary-500);
		background: color-mix(in oklch, var(--color-primary-500) 8%, transparent);
	}

	.field-option.empty {
		opacity: 0.5;
	}

	.field-option:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.option-badge {
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 1px 4px;
		border-radius: 3px;
		background: color-mix(in oklch, var(--layer-border) 40%, transparent);
		align-self: flex-start;
	}

	.field-option.active .option-badge {
		background: var(--color-primary-500);
		color: #fff;
	}

	.option-value {
		font-size: 0.72rem;
		line-height: 1.4;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		word-break: break-word;
	}

	.cover-preview {
		width: 40px;
		height: 56px;
		object-fit: cover;
		border-radius: 3px;
		align-self: center;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 16px 14px;
		border-top: 1px solid var(--layer-border);
	}

	.cancel-btn, .save-btn {
		padding: 6px 16px;
		border: none;
		border-radius: 5px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.cancel-btn {
		background: color-mix(in oklch, var(--layer-border) 30%, transparent);
		color: inherit;
	}

	.cancel-btn:hover {
		background: color-mix(in oklch, var(--layer-border) 50%, transparent);
	}

	.save-btn {
		background: var(--color-primary-500);
		color: #fff;
	}

	.save-btn:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
