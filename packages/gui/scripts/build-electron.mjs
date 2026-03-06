import { build } from 'esbuild';

const shared = {
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outdir: 'dist-electron',
	sourcemap: true,
	outExtension: { '.js': '.cjs' },
};

// Main process
await build({
	...shared,
	entryPoints: ['src/electron/main.ts'],
	external: ['electron'],
});

// Preload script
await build({
	...shared,
	entryPoints: ['src/electron/preload.ts'],
	external: ['electron'],
});

// Server entry — bundles @omo/core, externalizes native modules.
// Core uses import.meta.url in some files; polyfill it for CJS output.
await build({
	...shared,
	entryPoints: ['src/electron/server-entry.ts'],
	external: ['better-sqlite3'],
	define: {
		'import.meta.url': 'importMetaUrl',
	},
	banner: {
		js: 'var importMetaUrl = require("url").pathToFileURL(__filename).href;',
	},
});

console.log('Electron build complete.');
