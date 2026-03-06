<script lang="ts">
	let {
		entityType,
		entityId,
		name,
		nsfw = false,
		readerDirection = '',
		readerOffset = '',
		coverArtMode = '',
		onupdate,
		ondelete,
	}: {
		entityType: 'library' | 'collection';
		entityId: string;
		name: string;
		nsfw?: boolean;
		readerDirection?: string;
		readerOffset?: string;
		coverArtMode?: string;
		onupdate?: () => void;
		ondelete?: () => void;
	} = $props();

	let editName = $state(name);
	let confirmDelete = $state(false);

	let endpoint = $derived(entityType === 'library' ? '/api/user-libraries' : '/api/collections');
	let changeEvent = $derived(entityType === 'library' ? 'libraries-changed' : 'collections-changed');

	// Reset editName when the external name prop changes
	$effect(() => {
		editName = name;
	});

	async function updateField(field: string, value: string | null) {
		try {
			await fetch(endpoint, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: entityId, [field]: value }),
			});
			window.dispatchEvent(new CustomEvent(changeEvent));
			onupdate?.();
		} catch (err) {
			console.error(`Failed to update ${entityType}:`, err);
		}
	}

	function saveName() {
		const trimmed = editName.trim();
		if (trimmed && trimmed !== name) {
			updateField('name', trimmed);
		}
	}

	function handleNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			(e.target as HTMLInputElement).blur();
		}
	}

	async function doDelete() {
		try {
			const res = await fetch(`${endpoint}?id=${entityId}`, { method: 'DELETE' });
			if (res.ok) {
				window.dispatchEvent(new CustomEvent(changeEvent));
				ondelete?.();
			}
		} catch (err) {
			console.error(`Failed to delete ${entityType}:`, err);
		}
	}
</script>

<div class="entity-settings">
	<div class="setting-group">
		<label class="setting-label">Name</label>
		<div class="control">
			<input
				class="input is-small"
				type="text"
				bind:value={editName}
				onblur={saveName}
				onkeydown={handleNameKeydown}
			/>
		</div>
	</div>

	{#if entityType === 'library'}
		<div class="setting-group">
			<label class="setting-label">NSFW</label>
			<label class="checkbox nsfw-check">
				<input
					type="checkbox"
					checked={nsfw}
					onchange={(e) => updateField('nsfw', (e.target as HTMLInputElement).checked ? 'true' : 'false')}
				/>
				Contains adult content
			</label>
		</div>
	{/if}

	<div class="setting-group">
		<label class="setting-label">Reader Direction</label>
		<div class="select is-small">
			<select
				value={readerDirection || ''}
				onchange={(e) => {
					const v = (e.target as HTMLSelectElement).value;
					updateField('readerDirection', v || null);
				}}
			>
				<option value="">Auto</option>
				<option value="rtl">RTL</option>
				<option value="ltr">LTR</option>
			</select>
		</div>
	</div>

	<div class="setting-group">
		<label class="setting-label">Reader Offset</label>
		<div class="select is-small">
			<select
				value={readerOffset || ''}
				onchange={(e) => {
					const v = (e.target as HTMLSelectElement).value;
					updateField('readerOffset', v || null);
				}}
			>
				<option value="">Auto</option>
				<option value="true">On</option>
				<option value="false">Off</option>
			</select>
		</div>
	</div>

	<div class="setting-group">
		<label class="setting-label">Cover Art Mode</label>
		<div class="select is-small">
			<select
				value={coverArtMode || ''}
				onchange={(e) => {
					const v = (e.target as HTMLSelectElement).value;
					updateField('coverArtMode', v || null);
				}}
			>
				<option value="">Auto</option>
				<option value="none">None</option>
				<option value="auto">Page 1</option>
				<option value="offset">Page 2</option>
				<option value="offset2">Page 3</option>
			</select>
		</div>
	</div>

	<div class="setting-group danger">
		{#if confirmDelete}
			<p class="has-text-danger mb-2">Delete this {entityType}? This cannot be undone.</p>
			<div class="delete-actions">
				<button class="button is-danger is-small" onclick={doDelete}>Yes, delete</button>
				<button class="button is-small" onclick={() => confirmDelete = false}>Cancel</button>
			</div>
		{:else}
			<button class="button is-danger is-outlined is-small" onclick={() => confirmDelete = true}>
				Delete {entityType === 'library' ? 'Library' : 'Collection'}
			</button>
		{/if}
	</div>
</div>

<style>
	.entity-settings {
		background: var(--bg-secondary);
		border-radius: 8px;
		padding: 20px;
		margin-bottom: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.setting-group {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.setting-group .control {
		flex: 1;
		max-width: 300px;
	}

	.setting-label {
		font-size: 0.9rem;
		color: var(--text-primary);
		white-space: nowrap;
	}

	.nsfw-check {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.85rem;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.danger {
		border-top: 1px solid rgba(231, 76, 60, 0.2);
		padding-top: 16px;
		flex-direction: column;
		align-items: flex-start;
	}

	.delete-actions {
		display: flex;
		gap: 8px;
	}

	@media (max-width: 600px) {
		.setting-group { flex-direction: column; align-items: flex-start; gap: 6px; }
		.setting-group .control { max-width: none; width: 100%; }
	}
</style>
