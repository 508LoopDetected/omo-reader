/// <reference types="vite/client" />
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

// Register the service worker for PWA install + offline shell.
// Skipped in dev (Vite serves files unhashed and HMR conflicts with SW caching).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js').catch((err) => {
			console.warn('[sw] registration failed:', err);
		});
	});
}
