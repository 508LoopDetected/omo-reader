<script lang="ts">
	let {
		options,
		value,
		onchange,
	}: {
		options: { value: string; label: string }[];
		value: string;
		onchange: (value: string) => void;
	} = $props();
</script>

<div class="btn-group preset-outlined-surface-200-800 rounded-lg p-1">
	{#each options as opt}
		<button
			class="btn btn-sm rounded-md transition-all {value === opt.value ? 'preset-filled-primary-500' : 'hover:preset-filled-surface-200-800'}"
			onclick={() => onchange(opt.value)}
		>
			{opt.label}
		</button>
	{/each}
</div>
