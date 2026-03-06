/**
 * Token-bucket rate limiter with async acquire().
 * Blocks callers when tokens are exhausted until one becomes available.
 * Supports AbortSignal to remove queued waiters when requests are cancelled.
 */

export class RateLimiter {
	private tokens: number;
	private lastRefill: number;
	private waitQueue: { resolve: () => void; reject: (err: Error) => void }[] = [];

	constructor(
		private readonly maxTokens: number,
		private readonly refillIntervalMs: number,
	) {
		this.tokens = maxTokens;
		this.lastRefill = Date.now();
	}

	async acquire(signal?: AbortSignal): Promise<void> {
		signal?.throwIfAborted();
		this.refill();
		if (this.tokens > 0) {
			this.tokens--;
			return;
		}
		// Wait for a token to become available
		return new Promise<void>((resolve, reject) => {
			const entry = { resolve, reject };
			this.waitQueue.push(entry);

			// If signal aborts while queued, remove from queue and reject
			if (signal) {
				const onAbort = () => {
					const idx = this.waitQueue.indexOf(entry);
					if (idx !== -1) {
						this.waitQueue.splice(idx, 1);
						reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
					}
				};
				signal.addEventListener('abort', onAbort, { once: true });
				// Clean up listener if resolved normally
				const origResolve = entry.resolve;
				entry.resolve = () => {
					signal.removeEventListener('abort', onAbort);
					origResolve();
				};
			}

			setTimeout(() => {
				this.refill();
				this.drainQueue();
			}, this.refillIntervalMs);
		});
	}

	private refill(): void {
		const now = Date.now();
		const elapsed = now - this.lastRefill;
		const newTokens = Math.floor(elapsed / this.refillIntervalMs) * this.maxTokens;
		if (newTokens > 0) {
			this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
			this.lastRefill = now;
		}
	}

	private drainQueue(): void {
		while (this.waitQueue.length > 0 && this.tokens > 0) {
			this.tokens--;
			const entry = this.waitQueue.shift()!;
			entry.resolve();
		}
	}
}
