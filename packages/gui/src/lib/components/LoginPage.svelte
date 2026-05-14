<script lang="ts">
	import { setConnection } from '$lib/api';

	let { errorMessage = 'Authentication required.' }: { errorMessage?: string } = $props();

	let token = $state('');
	let submitting = $state(false);
	let error = $state('');

	async function submit(e: Event) {
		e.preventDefault();
		const t = token.trim();
		if (!t) return;
		submitting = true;
		error = '';
		try {
			const res = await fetch('/api/manifest', { headers: { Authorization: `Bearer ${t}` } });
			if (res.ok) {
				setConnection({ authToken: t });
				window.location.reload();
				return;
			}
			error = res.status === 401
				? 'Token rejected by server.'
				: `Server returned ${res.status}.`;
		} catch (err) {
			error = `Network error: ${(err as Error).message}`;
		} finally {
			submitting = false;
		}
	}
</script>

<div class="login-shell">
	<form class="login-card" onsubmit={submit}>
		<h1 class="login-title">omo</h1>
		<p class="login-subtitle">{errorMessage}</p>

		<p class="login-origin">
			Connecting to <code>{window.location.origin}</code>
		</p>

		<label class="login-field">
			<span class="login-label">Auth token</span>
			<input
				type="password"
				class="login-input"
				bind:value={token}
				placeholder="Paste your OMO_AUTH_TOKEN"
				autocomplete="current-password"
				autofocus
				spellcheck="false"
			/>
		</label>

		{#if error}
			<p class="login-error">{error}</p>
		{/if}

		<button type="submit" class="login-submit" disabled={submitting || !token.trim()}>
			{submitting ? 'Connecting…' : 'Connect'}
		</button>

		<p class="login-hint">
			The token is set as <code>OMO_AUTH_TOKEN</code> in the server's environment.
			It's saved to this browser's storage so you only enter it once per device.
		</p>
	</form>
</div>

<style>
	.login-shell {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 24px;
		background: var(--color-surface-50-950);
	}

	.login-card {
		display: flex;
		flex-direction: column;
		gap: 14px;
		width: 100%;
		max-width: 360px;
		padding: 32px 28px;
		background: color-mix(in oklab, var(--color-surface-50-950) 80%, transparent);
		border: 1px solid var(--layer-border);
		border-radius: 10px;
		box-shadow: var(--shadow-overlay);
	}

	.login-title {
		font-size: 1.6rem;
		margin: 0;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.login-subtitle {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-surface-500);
	}

	.login-origin {
		margin: 0;
		font-size: 0.75rem;
		color: var(--color-surface-500);
	}

	.login-origin code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		background: var(--layer-sunken);
		padding: 1px 6px;
		border-radius: 3px;
	}

	.login-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.login-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-surface-500);
	}

	.login-input {
		padding: 10px 12px;
		font-size: 0.9rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		border: 1px solid var(--layer-border);
		border-radius: 5px;
		background: var(--layer-sunken);
		color: inherit;
		outline: none;
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
	}

	.login-input:focus {
		border-color: var(--color-primary-500);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-primary-500) 18%, transparent);
	}

	.login-error {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-error-500);
	}

	.login-submit {
		padding: 10px 14px;
		font-size: 0.9rem;
		font-weight: 600;
		border: none;
		border-radius: 5px;
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
		cursor: pointer;
		transition: opacity var(--transition-fast), transform var(--transition-fast);
	}

	.login-submit:hover:not(:disabled) {
		opacity: 0.92;
	}

	.login-submit:active:not(:disabled) {
		transform: scale(0.99);
	}

	.login-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.login-hint {
		margin: 0;
		font-size: 0.7rem;
		line-height: 1.5;
		color: var(--color-surface-500);
	}

	.login-hint code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		background: var(--layer-sunken);
		padding: 0 4px;
		border-radius: 3px;
	}
</style>
