<script lang="ts">
	let {
		direction = '',
		offset = '',
		coverArtMode = '',
		directionOptions = [
			{ value: 'rtl', label: 'RTL' },
			{ value: 'ltr', label: 'LTR' },
		],
		offsetOptions = [
			{ value: 'true', label: 'On' },
			{ value: 'false', label: 'Off' },
		],
		coverArtOptions = [
			{ value: 'none', label: 'None' },
			{ value: 'auto', label: 'Page 1' },
			{ value: 'offset', label: 'Page 2' },
			{ value: 'offset2', label: 'Page 3' },
		],
		layout = 'row' as 'row' | 'stacked',
		onchange,
	}: {
		direction?: string;
		offset?: string;
		coverArtMode?: string;
		directionOptions?: { value: string; label: string }[];
		offsetOptions?: { value: string; label: string }[];
		coverArtOptions?: { value: string; label: string }[];
		layout?: 'row' | 'stacked';
		onchange: (field: 'direction' | 'offset' | 'coverArtMode', value: string | null) => void;
	} = $props();

	function handleChange(field: 'direction' | 'offset' | 'coverArtMode', value: string) {
		onchange(field, value || null);
	}
</script>

{#if layout === 'stacked'}
	<div class="flex flex-col gap-4">
		<div class="flex items-center justify-between gap-4">
			<label class="text-sm">Reader Direction</label>
			<select class="select text-sm px-2 py-1 rounded" value={direction || ''} onchange={(e) => handleChange('direction', (e.target as HTMLSelectElement).value)}>
				<option value="">Auto</option>
				{#each directionOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
		<div class="flex items-center justify-between gap-4">
			<label class="text-sm">Reader Offset</label>
			<select class="select text-sm px-2 py-1 rounded" value={offset || ''} onchange={(e) => handleChange('offset', (e.target as HTMLSelectElement).value)}>
				<option value="">Auto</option>
				{#each offsetOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
		<div class="flex items-center justify-between gap-4">
			<label class="text-sm">Cover Art Mode</label>
			<select class="select text-sm px-2 py-1 rounded" value={coverArtMode || ''} onchange={(e) => handleChange('coverArtMode', (e.target as HTMLSelectElement).value)}>
				<option value="">Auto</option>
				{#each coverArtOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
	</div>
{:else}
	<div class="flex items-center gap-2">
		<span class="text-xs text-surface-500">Reader:</span>
		<select class="select text-xs px-2 py-1 rounded" value={direction || ''} onchange={(e) => handleChange('direction', (e.target as HTMLSelectElement).value)}>
			<option value="">Auto</option>
			{#each directionOptions as opt}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
		<select class="select text-xs px-2 py-1 rounded" value={offset || ''} onchange={(e) => handleChange('offset', (e.target as HTMLSelectElement).value)}>
			<option value="">Offset: Auto</option>
			{#each offsetOptions as opt}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
		<select class="select text-xs px-2 py-1 rounded" value={coverArtMode || ''} onchange={(e) => handleChange('coverArtMode', (e.target as HTMLSelectElement).value)}>
			<option value="">Cover: Auto</option>
			{#each coverArtOptions as opt}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
	</div>
{/if}
