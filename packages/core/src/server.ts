/**
 * Lightweight HTTP server for @omo/core.
 *
 * Serves API endpoints, image proxy, thumbnails, and local/SMB images.
 * Does NOT serve Svelte pages — that's the GUI's job.
 *
 * Usage:
 *   import { initialize } from '@omo/core';
 *   import { createServer } from '@omo/core';
 *   initialize();
 *   const server = createServer({ port: 3210 });
 *   // server.stop() to shut down
 */

import { createServer as createHttpServer } from 'node:http';
import { route } from './router.js';

export interface ServerOptions {
	/** Port to listen on (default: 3210). */
	port?: number;
	/** Hostname to bind to (default: '127.0.0.1'). */
	hostname?: string;
}

export interface OmoServer {
	/** The port the server is listening on. */
	port: number;
	/** The hostname the server is bound to. */
	hostname: string;
	/** Stop the server. */
	stop(): void;
}

const CORS_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Start the lightweight HTTP server.
 * Requires `initialize()` to have been called first.
 */
export function createServer(options: ServerOptions = {}): OmoServer {
	const port = options.port ?? 3210;
	const hostname = options.hostname ?? '127.0.0.1';

	const server = createHttpServer(async (req, res) => {
		// Build a standard Request from the Node IncomingMessage
		const url = `http://${hostname}:${port}${req.url || '/'}`;
		const headers = new Headers();
		for (const [key, value] of Object.entries(req.headers)) {
			if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
		}

		// Collect body for non-GET/HEAD methods
		let body: Buffer | null = null;
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			const chunks: Buffer[] = [];
			for await (const chunk of req) chunks.push(chunk as Buffer);
			body = Buffer.concat(chunks);
		}

		const controller = new AbortController();
		req.on('close', () => controller.abort());

		const request = new Request(url, {
			method: req.method || 'GET',
			headers,
			body,
			signal: controller.signal,
		});

		// Handle CORS preflight
		if (req.method === 'OPTIONS') {
			res.writeHead(204, CORS_HEADERS);
			res.end();
			return;
		}

		try {
			const response = await route(request);
			const finalResponse = response ?? new Response(JSON.stringify({ error: 'Not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			});

			// Write status + headers
			const outHeaders: Record<string, string> = { ...CORS_HEADERS };
			finalResponse.headers.forEach((value, key) => {
				outHeaders[key] = value;
			});
			res.writeHead(finalResponse.status, outHeaders);

			// Write body
			const responseBody = finalResponse.body;
			if (responseBody) {
				const reader = responseBody.getReader();
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					res.write(value);
				}
			}
			res.end();
		} catch (err) {
			console.error('Unhandled server error:', err);
			const outHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...CORS_HEADERS };
			res.writeHead(500, outHeaders);
			res.end(JSON.stringify({ error: 'Internal server error' }));
		}
	});

	server.listen(port, hostname, () => {
		console.log(`omo-core server listening on http://${hostname}:${port}`);
	});

	return {
		port,
		hostname,
		stop() {
			server.close();
		},
	};
}
