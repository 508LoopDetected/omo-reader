<div class="text-center py-8">
	<div class="loader-inline"></div>
</div>

<style>
	.loader-inline {
		width: 32px;
		height: 32px;
		border: 3px solid color-mix(in srgb, currentColor 20%, transparent);
		border-top-color: var(--color-primary-500);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto;
	}

	@keyframes spin { to { transform: rotate(360deg); } }
</style>
