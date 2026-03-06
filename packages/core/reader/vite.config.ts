import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

export default defineConfig({
	plugins: [svelte()],
	root: resolve(__dirname),
	base: '/reader/',
	build: {
		outDir: resolve(__dirname, '../static/reader'),
		emptyOutDir: true,
	},
});
