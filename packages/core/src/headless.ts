/**
 * Headless entrypoint for running @omo/core as a standalone server (Docker, systemd, etc.).
 * Reads HOST / PORT / OMO_AUTH_TOKEN / OMO_DB_PATH from the environment.
 */

import { initialize, createServer } from './index.js';

initialize();
const server = createServer();

const shutdown = (signal: string) => {
	console.log(`Received ${signal}, shutting down...`);
	server.stop();
	process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
