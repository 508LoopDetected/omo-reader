#!/usr/bin/env node
/**
 * omotui — full-screen terminal interface for omo-reader.
 *
 * Initializes @omo/core directly, starts the
 * lightweight HTTP server for image serving and the reader webview,
 * then runs the TUI.
 */

// Handle --reader subprocess mode (spawned by openReader() in app.ts).
// The webview's GTK event loop blocks the thread, so the reader runs
// in a separate process to keep the HTTP server responsive.
const readerFlagIdx = process.argv.indexOf('--reader');
if (readerFlagIdx !== -1) {
	const url = process.argv[readerFlagIdx + 1];
	if (!url) { console.error('Usage: --reader <url>'); process.exit(1); }
	const { openReaderWindow } = await import('./reader.js');
	openReaderWindow(url);
	process.exit(0);
}

import { initialize, createServer, type OmoServer } from '@omo/core';
import { run } from './tea.js';
import { createProgram } from './app.js';
import { setBaseUrl } from './api.js';
import { getManifest } from './manifest.js';

const PORT = parseInt(process.env.PORT || '3210', 10);
const HOST = process.env.HOST || '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;

let server: OmoServer | null = null;

// ── Spinner for startup ──

function printSpinner(message: string): { stop: () => void } {
	const frames = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];
	let i = 0;
	const interval = setInterval(() => {
		process.stdout.write(`\r${frames[i % frames.length]} ${message}`);
		i++;
	}, 80);
	return {
		stop() {
			clearInterval(interval);
			process.stdout.write('\r' + ' '.repeat(message.length + 4) + '\r');
		},
	};
}

// ── Main ──

async function main(): Promise<void> {
	const spinner = printSpinner('Initializing omo...');

	try {
		// Initialize core (DB, cache paths)
		initialize();

		// Start lightweight HTTP server (for images + reader webview)
		server = createServer({ port: PORT, hostname: HOST });

		spinner.stop();
	} catch (err) {
		spinner.stop();
		console.error('Failed to initialize:', err);
		process.exit(1);
	}

	setBaseUrl(BASE_URL);

	try {
		const manifest = await getManifest();
		const program = createProgram(manifest);
		await run(program);
	} finally {
		if (server) {
			server.stop();
		}
	}
}

main().catch((err) => {
	// Restore terminal on fatal error
	process.stdout.write('\x1b[?1049l\x1b[?25h');
	console.error('Fatal error:', err);
	if (server) server.stop();
	process.exit(1);
});
