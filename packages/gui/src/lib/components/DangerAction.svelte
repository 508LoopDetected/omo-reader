<script lang="ts">
	let {
		label,
		confirmMessage,
		confirmLabel = 'Yes, delete',
		onconfirm,
	}: {
		label: string;
		confirmMessage: string;
		confirmLabel?: string;
		onconfirm: () => void | Promise<void>;
	} = $props();

	let confirming = $state(false);
	let loading = $state(false);

	async function doConfirm() {
		loading = true;
		try {
			await onconfirm();
		} finally {
			loading = false;
			confirming = false;
		}
	}
</script>

{#if confirming}
	<div class="card preset-tonal-error p-4 rounded-lg">
		<p class="text-error-500 mb-3">{confirmMessage}</p>
		<div class="flex gap-2">
			<button class="btn btn-sm preset-filled-error-500" disabled={loading} onclick={doConfirm}>
				{loading ? 'Working...' : confirmLabel}
			</button>
			<button class="btn btn-sm preset-tonal-surface" disabled={loading} onclick={() => confirming = false}>
				Cancel
			</button>
		</div>
	</div>
{:else}
	<button class="btn btn-sm preset-tonal-error" onclick={() => confirming = true}>
		{label}
	</button>
{/if}
