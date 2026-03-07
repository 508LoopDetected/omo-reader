import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Start the @omo/core HTTP server as a subprocess during `vite dev`.
 * Uses tsx to run the TypeScript server entry directly.
 */
function coreDevServer(): Plugin {
	let proc: ChildProcess | null = null;

	return {
		name: 'core-dev-server',
		apply: 'serve',
		configureServer() {
			const workspaceRoot = resolve(__dirname, '../..');
			const legacyDb = resolve(workspaceRoot, 'data/omo-reader.db');
			const env = { ...process.env };
			if (!env.OMO_DB_PATH && existsSync(legacyDb)) {
				env.OMO_DB_PATH = legacyDb;
			}

			proc = spawn('node', [
				'--import', 'tsx',
				'-e',
				'const{initialize,createServer}=require("@omo/core");initialize();createServer({port:3210,hostname:"127.0.0.1"})',
			], {
				stdio: 'inherit',
				cwd: process.cwd(),
				env,
			});

			proc.on('exit', (code) => {
				if (code && code !== 0) {
					console.error(`[core-dev-server] exited with code ${code}`);
				}
				proc = null;
			});

			return new Promise<void>((resolve) => setTimeout(resolve, 500));
		},
		closeBundle() {
			if (proc) {
				proc.kill('SIGTERM');
				proc = null;
			}
		},
	};
}

export default defineConfig({
	plugins: [coreDevServer(), tailwindcss(), svelte()],
	resolve: {
		alias: {
			'$lib': resolve(__dirname, 'src/lib'),
		},
	},
	server: {
		proxy: {
			'/api': 'http://127.0.0.1:3210',
			'/reader': 'http://127.0.0.1:3210',
		},
	},
	publicDir: resolve(__dirname, 'static'),
	build: {
		outDir: resolve(__dirname, 'build'),
		emptyOutDir: true,
	},
});
