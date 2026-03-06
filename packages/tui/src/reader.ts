/**
 * TUI reader — opens the reader in the user's default browser.
 *
 * TODO: Replace with a native webview solution for an integrated experience.
 */

import { platform } from 'node:os';
import { spawn } from 'node:child_process';

/**
 * Open the reader in the user's default browser.
 * Blocks until the spawned process exits.
 */
export function openReaderWindow(url: string): void {
	const os = platform();
	let cmd: string;
	let args: string[];

	if (os === 'darwin') {
		cmd = 'open';
		args = [url];
	} else if (os === 'win32') {
		cmd = 'cmd';
		args = ['/c', 'start', url];
	} else {
		cmd = 'xdg-open';
		args = [url];
	}

	spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}
