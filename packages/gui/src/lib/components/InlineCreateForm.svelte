<script lang="ts">
	interface FieldConfig {
		key: string;
		label: string;
		type?: 'text' | 'password' | 'select';
		placeholder?: string;
		required?: boolean;
		options?: { value: string; label: string }[];
		defaultValue?: string;
	}

	let {
		fields,
		submitLabel = 'Add',
		onsubmit,
		extraActions,
	}: {
		fields: FieldConfig[];
		submitLabel?: string;
		onsubmit: (values: Record<string, string>) => void | Promise<void>;
		extraActions?: import('svelte').Snippet<[Record<string, string>]>;
	} = $props();

	let formData = $state<Record<string, string>>({});
	let visible = $state(false);

	function initForm() {
		const data: Record<string, string> = {};
		for (const f of fields) {
			data[f.key] = f.defaultValue ?? '';
		}
		formData = data;
	}

	function isValid(): boolean {
		return fields
			.filter(f => f.required)
			.every(f => (formData[f.key] ?? '').trim() !== '');
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		const values: Record<string, string> = {};
		for (const [k, v] of Object.entries(formData)) {
			values[k] = v.trim();
		}
		await onsubmit(values);
		initForm();
	}

	function toggle() {
		visible = !visible;
		if (visible) initForm();
	}

	let isMultiRow = $derived(fields.filter(f => f.type !== 'select').length > 2);
	let selectFields = $derived(fields.filter(f => f.type === 'select'));
	let nonSelectFields = $derived(fields.filter(f => f.type !== 'select'));

	// Export toggle for parent components
	export { toggle, visible };
</script>

{#if visible}
	<form class="card bg-surface-100-900 rounded-lg p-5 mb-5" onsubmit={handleSubmit}>
		{#if isMultiRow}
			{#each nonSelectFields as field}
				<div class="mb-3">
					<label class="text-xs text-surface-500 mb-1 block">{field.label}{#if !field.required} (optional){/if}</label>
					<input
						class="input text-sm px-3 py-2 rounded"
						type={field.type === 'password' ? 'password' : 'text'}
						placeholder={field.placeholder ?? ''}
						value={formData[field.key] ?? ''}
						oninput={(e) => { formData = { ...formData, [field.key]: (e.target as HTMLInputElement).value }; }}
					/>
				</div>
			{/each}
			{#if selectFields.length > 0}
				<div class="flex gap-3">
					{#each selectFields as field}
						<div class="flex-1 mb-3">
							<label class="text-xs text-surface-500 mb-1 block">{field.label}</label>
							<select
								class="select text-sm px-3 py-2 rounded w-full"
								value={formData[field.key] ?? field.defaultValue ?? ''}
								onchange={(e) => { formData = { ...formData, [field.key]: (e.target as HTMLSelectElement).value }; }}
							>
								{#each (field.options ?? []) as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="flex gap-3">
				{#each fields as field}
					<div class="mb-3" style={field.type === 'select' ? 'flex:1' : 'flex:2'}>
						<label class="text-xs text-surface-500 mb-1 block">{field.label}</label>
						{#if field.type === 'select'}
							<select
								class="select text-sm px-3 py-2 rounded w-full"
								value={formData[field.key] ?? field.defaultValue ?? ''}
								onchange={(e) => { formData = { ...formData, [field.key]: (e.target as HTMLSelectElement).value }; }}
							>
								{#each (field.options ?? []) as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						{:else}
							<input
								class="input text-sm px-3 py-2 rounded"
								type={field.type === 'password' ? 'password' : 'text'}
								placeholder={field.placeholder ?? ''}
								value={formData[field.key] ?? ''}
								oninput={(e) => { formData = { ...formData, [field.key]: (e.target as HTMLInputElement).value }; }}
							/>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<div class="flex gap-2 mt-3">
			<button class="btn btn-sm preset-filled-primary-500" type="submit" disabled={!isValid()}>{submitLabel}</button>
			{#if extraActions}
				{@render extraActions(formData)}
			{/if}
			<button class="btn btn-sm preset-tonal-surface" type="button" onclick={toggle}>Cancel</button>
		</div>
	</form>
{/if}
