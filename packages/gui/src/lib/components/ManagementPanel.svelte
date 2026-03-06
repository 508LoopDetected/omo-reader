<script lang="ts">
	import type { ManagementSection, ManagementActionDef, FieldDef } from '@omo/core';

	let { sectionIds, onchange }: { sectionIds: string[]; onchange?: () => void } = $props();

	let management = $state<ManagementSection[]>([]);
	let loading = $state(true);

	// Per-section create form state
	let createForms = $state<Record<string, Record<string, string>>>({});

	// SMB test state
	let smbTesting = $state<string | null>(null);
	let smbTestResult = $state<{ ok: boolean; msg: string } | null>(null);

	// Danger zone confirm state
	let confirmAction = $state<{ sectionId: string; actionKey: string } | null>(null);
	let actionLoading = $state<string | null>(null);

	async function loadManagement() {
		try {
			const res = await fetch('/api/manifest');
			if (res.ok) {
				const manifest = await res.json();
				management = (manifest.management as ManagementSection[]).filter(
					(s: ManagementSection) => sectionIds.includes(s.id)
				);
				initCreateForms();
			}
		} catch (err) {
			console.error('Failed to load management sections:', err);
		} finally {
			loading = false;
		}
	}

	function initCreateForms() {
		const forms: Record<string, Record<string, string>> = {};
		for (const section of management) {
			if (section.createFields) {
				const formData: Record<string, string> = {};
				for (const field of section.createFields) {
					formData[field.key] = field.defaultValue ?? '';
				}
				forms[section.id] = formData;
			}
		}
		createForms = forms;
	}

	async function reloadManagement() {
		try {
			const res = await fetch('/api/manifest');
			if (res.ok) {
				const manifest = await res.json();
				management = (manifest.management as ManagementSection[]).filter(
					(s: ManagementSection) => sectionIds.includes(s.id)
				);
			}
		} catch { /* ignore */ }
	}

	function dispatchChangeEvents(sectionId: string) {
		if (sectionId === 'libraries') {
			window.dispatchEvent(new CustomEvent('libraries-changed'));
		} else if (sectionId === 'collections') {
			window.dispatchEvent(new CustomEvent('collections-changed'));
		}
		onchange?.();
	}

	// CRUD helpers

	function isCreateFormValid(section: ManagementSection): boolean {
		if (!section.createFields) return false;
		const form = createForms[section.id];
		if (!form) return false;
		return section.createFields
			.filter(f => f.required)
			.every(f => (form[f.key] ?? '').trim() !== '');
	}

	async function createItem(section: ManagementSection) {
		if (!section.endpoints.create) return;
		const form = createForms[section.id];
		if (!form) return;

		const body: Record<string, string> = {};
		for (const [k, v] of Object.entries(form)) {
			body[k] = v.trim();
		}

		try {
			const res = await fetch(section.endpoints.create, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (res.ok) {
				if (section.createFields) {
					const newForm: Record<string, string> = {};
					for (const field of section.createFields) {
						newForm[field.key] = field.defaultValue ?? '';
					}
					createForms = { ...createForms, [section.id]: newForm };
				}
				smbTestResult = null;
				await reloadManagement();
				dispatchChangeEvents(section.id);
			}
		} catch (err) {
			console.error(`Failed to create ${section.id}:`, err);
		}
	}

	async function updateItemField(section: ManagementSection, itemId: string | number, field: string, value: string | null) {
		if (!section.endpoints.update) return;
		try {
			await fetch(section.endpoints.update, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: String(itemId), [field]: value }),
			});
			await reloadManagement();
			dispatchChangeEvents(section.id);
		} catch (err) {
			console.error(`Failed to update ${section.id}:`, err);
		}
	}

	async function deleteItem(section: ManagementSection, itemId: string | number) {
		if (!section.endpoints.delete) return;
		if (section.deleteConfirmation) {
			const confirmed = confirm(section.deleteConfirmation);
			if (!confirmed) return;
		}
		try {
			const res = await fetch(`${section.endpoints.delete}?id=${itemId}`, { method: 'DELETE' });
			if (res.ok) {
				const data = await res.json().catch(() => ({}));
				if (data.removedTitles > 0) {
					window.dispatchEvent(new CustomEvent('libraries-changed'));
					window.dispatchEvent(new CustomEvent('collections-changed'));
				}
			}
			await reloadManagement();
			dispatchChangeEvents(section.id);
		} catch (err) {
			console.error(`Failed to delete ${section.id}:`, err);
		}
	}

	async function executeAction(section: ManagementSection, action: ManagementActionDef) {
		if (action.confirmation && !action.dangerous) {
			const confirmed = confirm(action.confirmation);
			if (!confirmed) return;
		}
		if (action.dangerous) {
			confirmAction = { sectionId: section.id, actionKey: action.key };
			return;
		}
		await doExecuteAction(section, action);
	}

	async function doExecuteAction(section: ManagementSection, action: ManagementActionDef) {
		actionLoading = action.key;
		try {
			const method = action.method ?? 'POST';
			await fetch(action.endpoint, { method });
			if (action.key === 'reset') {
				window.location.href = '/';
				return;
			}
			await reloadManagement();
		} catch (err) {
			console.error(`Action ${action.key} failed:`, err);
		} finally {
			actionLoading = null;
			confirmAction = null;
		}
	}

	async function testSmb(itemId?: string) {
		smbTesting = itemId ?? 'new';
		smbTestResult = null;
		try {
			let body: Record<string, string>;
			if (itemId) {
				body = { id: itemId };
			} else {
				const form = createForms['smb'];
				if (!form) return;
				body = {
					host: form.host?.trim() ?? '',
					share: form.share?.trim() ?? '',
					domain: form.domain?.trim() ?? '',
					username: form.username?.trim() ?? '',
					password: form.password?.trim() ?? '',
				};
			}
			const res = await fetch('/api/settings/smb/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (res.ok) {
				const data = await res.json();
				smbTestResult = { ok: data.connected, msg: data.connected ? 'Connected' : (data.error || 'Failed') };
			}
		} catch {
			smbTestResult = { ok: false, msg: 'Request failed' };
		} finally {
			smbTesting = null;
		}
	}

	function getItemId(item: Record<string, unknown>): string | number {
		return (item.id as string | number) ?? '';
	}

	function getItemDisplay(item: Record<string, unknown>, field: FieldDef): string {
		const val = item[field.key];
		if (val == null) return '';
		if (field.options) {
			const opt = field.options.find(o => o.value === String(val));
			return opt?.label ?? String(val);
		}
		return String(val);
	}

	function handleCreateSubmit(e: Event, section: ManagementSection) {
		e.preventDefault();
		createItem(section);
	}

	function getForm(sectionId: string): Record<string, string> {
		return createForms[sectionId] ?? {};
	}

	function getSubmitLabel(sectionId: string): string {
		switch (sectionId) {
			case 'libraries': return 'Create Library';
			case 'collections': return 'Create Collection';
			case 'paths': return 'Add Path';
			case 'repos': return 'Add Repo';
			default: return 'Add';
		}
	}

	function isMultiRow(section: ManagementSection): boolean {
		return (section.createFields?.length ?? 0) > 2;
	}

	function getSelectFields(section: ManagementSection): FieldDef[] {
		return section.createFields?.filter(f => f.type === 'select') ?? [];
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	$effect(() => {
		loadManagement();
	});
</script>

{#if loading}
	<div class="has-text-centered py-4">
		<div class="loader-inline"></div>
	</div>
{:else}
	{#each management as section}
		<div class="mgmt-section" class:danger-zone={section.id === 'danger'}>
			<h3 class="title is-5" class:has-text-danger={section.id === 'danger'}>{section.label}</h3>
			{#if section.description}
				<p class="has-text-grey mb-4">{section.description}</p>
			{/if}

			<!-- Stats (for cache section) -->
			{#if section.stats && section.stats.totalSize !== undefined}
				<div class="settings-grid mb-4">
					<div class="setting-item">
						<span class="setting-label">Cache size</span>
						<span>{formatBytes(section.stats.totalSize as number)} ({section.stats.totalCount} thumbnails)</span>
					</div>
				</div>
			{/if}

			<!-- Existing items -->
			{#if section.items.length > 0 && section.itemFields}
				<div class="path-list">
					{#each section.items as item}
						{@const itemId = getItemId(item)}
						<div class="list-item">
							<div class="list-item-info">
								{#each section.itemFields as field, i}
									{@const display = getItemDisplay(item, field)}
									{#if display}
										{#if i === 0}
											<div class="list-item-primary">{display}</div>
										{:else if field.type === 'text' || !field.options}
											<div class="list-item-secondary">{display}</div>
										{/if}
									{/if}
								{/each}
								{#if section.id === 'smb'}
									<div class="list-item-secondary">//{item.host}/{item.share}{item.path ? '/' + item.path : ''}</div>
								{/if}
							</div>
							<div class="list-item-actions">
								{#each (section.itemFields ?? []) as field}
									{#if field.options && field.options.length > 0}
										<div class="select is-small">
											<select
												value={String(item[field.key] ?? field.defaultValue ?? '')}
												onchange={(e) => updateItemField(section, itemId, field.key, (e.target as HTMLSelectElement).value)}
											>
												{#each field.options as opt}
													<option value={opt.value}>{opt.label}</option>
												{/each}
											</select>
										</div>
									{/if}
								{/each}

								{#if section.id === 'libraries'}
									<label class="checkbox is-small nsfw-check">
										<input
											type="checkbox"
											checked={!!item.nsfw}
											onchange={(e) => updateItemField(section, itemId, 'nsfw', (e.target as HTMLInputElement).checked ? 'true' : 'false')}
										/>
										NSFW
									</label>
								{/if}

								{#if section.readerOverrides}
									<div class="select is-small">
										<select
											value={String(item.readerDirection ?? '')}
											onchange={(e) => {
												const v = (e.target as HTMLSelectElement).value;
												updateItemField(section, itemId, 'readerDirection', v || null);
											}}
										>
											<option value="">Direction: Auto</option>
											<option value="rtl">RTL</option>
											<option value="ltr">LTR</option>
										</select>
									</div>
									<div class="select is-small">
										<select
											value={String(item.readerOffset ?? '')}
											onchange={(e) => {
												const v = (e.target as HTMLSelectElement).value;
												updateItemField(section, itemId, 'readerOffset', v || null);
											}}
										>
											<option value="">Offset: Auto</option>
											<option value="true">Offset: On</option>
											<option value="false">Offset: Off</option>
										</select>
									</div>
									<div class="select is-small">
										<select
											value={String(item.coverArtMode ?? '')}
											onchange={(e) => {
												const v = (e.target as HTMLSelectElement).value;
												updateItemField(section, itemId, 'coverArtMode', v || null);
											}}
										>
											<option value="">Cover: Auto</option>
											<option value="none">Cover: None</option>
											<option value="auto">Cover: Page 1</option>
											<option value="offset">Cover: Page 2</option>
											<option value="offset2">Cover: Page 3</option>
										</select>
									</div>
								{/if}

								{#if section.actions}
									{#each section.actions as action}
										{#if action.key === 'test'}
											<button
												class="button is-small is-info is-outlined"
												disabled={smbTesting === String(itemId)}
												onclick={() => testSmb(String(itemId))}
											>
												{smbTesting === String(itemId) ? 'Testing...' : 'Test'}
											</button>
										{/if}
									{/each}
								{/if}

								{#if section.endpoints.delete}
									<button class="button is-small is-danger is-outlined" onclick={() => deleteItem(section, itemId)}>Remove</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else if section.id === 'repos' && section.items.length === 0}
				<p class="has-text-grey-dark mb-4">No custom repos. Using default: <code>kodjodevf/mangayomi-extensions</code></p>
			{/if}

			<!-- Create form -->
			{#if section.createFields && section.createFields.length > 0}
				<form class="add-form" onsubmit={(e) => handleCreateSubmit(e, section)}>
					{#if isMultiRow(section)}
						{#each section.createFields as field}
							{#if field.type !== 'select'}
								<div class="field">
									<label class="label has-text-grey-light">{field.label}{#if !field.required} (optional){/if}</label>
									<div class="control">
										<input
											class="input"
											type={field.type === 'password' ? 'password' : 'text'}
											placeholder={field.placeholder ?? ''}
											value={getForm(section.id)[field.key] ?? ''}
											oninput={(e) => {
												createForms = {
													...createForms,
													[section.id]: { ...createForms[section.id], [field.key]: (e.target as HTMLInputElement).value }
												};
											}}
										/>
									</div>
								</div>
							{/if}
						{/each}
						{#if getSelectFields(section).length > 0}
							<div class="field-row">
								{#each getSelectFields(section) as field}
									<div class="field" style="flex:1">
										<label class="label has-text-grey-light">{field.label}</label>
										<div class="select" style="width:100%">
											<select
												value={getForm(section.id)[field.key] ?? field.defaultValue ?? ''}
												onchange={(e) => {
													createForms = {
														...createForms,
														[section.id]: { ...createForms[section.id], [field.key]: (e.target as HTMLSelectElement).value }
													};
												}}
												style="width:100%"
											>
												{#each (field.options ?? []) as opt}
													<option value={opt.value}>{opt.label}</option>
												{/each}
											</select>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					{:else}
						<div class="field-row">
							{#each section.createFields as field}
								<div class="field" style={field.type === 'select' ? 'flex:1' : 'flex:2'}>
									<label class="label has-text-grey-light">{field.label}</label>
									{#if field.type === 'select'}
										<div class="select" style="width:100%">
											<select
												value={getForm(section.id)[field.key] ?? field.defaultValue ?? ''}
												onchange={(e) => {
													createForms = {
														...createForms,
														[section.id]: { ...createForms[section.id], [field.key]: (e.target as HTMLSelectElement).value }
													};
												}}
												style="width:100%"
											>
												{#each (field.options ?? []) as opt}
													<option value={opt.value}>{opt.label}</option>
												{/each}
											</select>
										</div>
									{:else}
										<div class="control">
											<input
												class="input"
												type={field.type === 'password' ? 'password' : 'text'}
												placeholder={field.placeholder ?? ''}
												value={getForm(section.id)[field.key] ?? ''}
												oninput={(e) => {
													createForms = {
														...createForms,
														[section.id]: { ...createForms[section.id], [field.key]: (e.target as HTMLInputElement).value }
													};
												}}
											/>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					{#if section.id === 'smb'}
						<div class="smb-form-actions">
							<button class="button is-primary" type="submit" disabled={!isCreateFormValid(section)}>Add SMB Share</button>
							<button class="button is-info is-outlined" type="button"
								disabled={!(getForm(section.id).host?.trim()) || !(getForm(section.id).share?.trim()) || !(getForm(section.id).username?.trim()) || !(getForm(section.id).password?.trim()) || smbTesting === 'new'}
								onclick={() => testSmb()}
							>{smbTesting === 'new' ? 'Testing...' : 'Test Connection'}</button>
						</div>
						{#if smbTestResult}
							<p class="mt-2" class:has-text-success={smbTestResult.ok} class:has-text-danger={!smbTestResult.ok}>
								{smbTestResult.msg}
							</p>
						{/if}
					{:else}
						<button class="button is-primary" type="submit" disabled={!isCreateFormValid(section)}>{getSubmitLabel(section.id)}</button>
					{/if}
				</form>
			{/if}

			<!-- Standalone actions -->
			{#if section.actions && section.id !== 'smb'}
				{#each section.actions as action}
					{#if action.dangerous}
						{#if confirmAction?.sectionId === section.id && confirmAction?.actionKey === action.key}
							<div class="reset-confirm">
								<p class="has-text-danger mb-3">{action.confirmation}</p>
								<div class="reset-actions">
									<button
										class="button is-danger"
										disabled={actionLoading === action.key}
										onclick={() => doExecuteAction(section, action)}
									>
										{actionLoading === action.key ? 'Resetting...' : 'Yes, delete everything'}
									</button>
									<button
										class="button"
										disabled={actionLoading === action.key}
										onclick={() => confirmAction = null}
									>
										Cancel
									</button>
								</div>
							</div>
						{:else}
							<button class="button is-danger is-outlined" onclick={() => executeAction(section, action)}>
								{action.label}
							</button>
						{/if}
					{:else}
						<button
							class="button is-small is-warning is-outlined"
							disabled={actionLoading === action.key}
							onclick={() => executeAction(section, action)}
						>
							{actionLoading === action.key ? 'Working...' : action.label}
						</button>
					{/if}
				{/each}
			{/if}
		</div>
	{/each}
{/if}

<style>
	.mgmt-section {
		background: var(--bg-secondary);
		border-radius: 8px;
		padding: 24px;
		margin-bottom: 20px;
	}

	.path-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 24px;
	}

	.list-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: var(--bg-card);
		border-radius: 6px;
		gap: 12px;
	}

	.list-item-info { min-width: 0; flex: 1; }

	.list-item-primary {
		font-family: monospace;
		font-size: 0.9rem;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.list-item-secondary {
		font-size: 0.8rem;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.list-item-actions {
		display: flex;
		gap: 6px;
		flex-shrink: 0;
	}

	.field-row {
		display: flex;
		gap: 12px;
	}

	.field-row .field { flex: 1; }

	.smb-form-actions {
		display: flex;
		gap: 8px;
		margin-top: 4px;
	}

	.add-form {
		border-top: 1px solid #1e1e2e;
		padding-top: 16px;
	}

	.label { font-size: 0.85rem !important; }

	code {
		background: var(--bg-card);
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 0.85rem;
	}

	.settings-grid {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.setting-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.setting-label {
		font-size: 0.9rem;
		color: var(--text-primary);
	}

	.danger-zone {
		border: 1px solid rgba(231, 76, 60, 0.3);
	}

	.reset-confirm {
		background: rgba(231, 76, 60, 0.08);
		border-radius: 6px;
		padding: 16px;
	}

	.reset-actions {
		display: flex;
		gap: 8px;
	}

	.nsfw-check {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.8rem;
		color: var(--text-secondary);
		cursor: pointer;
		white-space: nowrap;
	}

	.loader-inline {
		width: 32px;
		height: 32px;
		border: 3px solid #333;
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto;
	}

	@keyframes spin { to { transform: rotate(360deg); } }
</style>
