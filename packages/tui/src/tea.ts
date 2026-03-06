/**
 * Minimal bubbletea-style TUI runtime.
 * Elm architecture: Model -> update(model, msg) -> view(model) -> string
 *
 * Supports async commands via dispatch: schedule background work that
 * updates the model and triggers a re-render when complete.
 */

import { parseKey, type Msg, type KeyMsg } from './keys.js';

export type { Msg, KeyMsg };
export type { ResizeMsg } from './keys.js';

/** Function to schedule a background model update. */
export type Dispatch<M> = (fn: (model: M) => Promise<M>) => void;

export interface Program<M> {
	init: () => M;
	/** Called once after the first render with dispatch available. Use to trigger async initial loads. */
	initCmd?: (dispatch: Dispatch<M>) => void;
	update: (model: M, msg: Msg, dispatch: Dispatch<M>) => M | Promise<M>;
	view: (model: M) => string;
}

/** Enter alternate screen buffer */
function enterAltScreen(): void {
	process.stdout.write('\x1b[?1049h');
}

/** Leave alternate screen buffer */
function leaveAltScreen(): void {
	process.stdout.write('\x1b[?1049l');
}

/** Hide cursor */
function hideCursor(): void {
	process.stdout.write('\x1b[?25l');
}

/** Show cursor */
function showCursor(): void {
	process.stdout.write('\x1b[?25h');
}

/** Move cursor to top-left and clear screen */
function clearScreen(): void {
	process.stdout.write('\x1b[H\x1b[2J');
}

/**
 * Run a bubbletea-style program.
 * Takes over the terminal, handles input, and renders the view.
 */
export async function run<M>(program: Program<M>): Promise<void> {
	let model = program.init();
	let lastOutput = '';
	let running = true;

	function render(): void {
		if (!running) return;
		const output = program.view(model);
		if (output !== lastOutput) {
			clearScreen();
			process.stdout.write(output);
			lastOutput = output;
		}
	}

	/** Dispatch: schedule a background model update, re-render on completion. */
	const dispatch: Dispatch<M> = (fn) => {
		fn(model).then((newModel) => {
			if (!running) return;
			model = newModel;
			// Check for quit signal
			if ((model as any)?.__quit) {
				cleanup();
				resolveRun?.();
				return;
			}
			render();
		}).catch(() => {
			// Errors are handled within dispatch callbacks
		});
	};

	function cleanup(): void {
		if (!running) return;
		running = false;

		if (process.stdin.isTTY) {
			process.stdin.setRawMode(false);
		}
		process.stdin.pause();
		showCursor();
		leaveAltScreen();
	}

	// Setup
	enterAltScreen();
	hideCursor();

	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
	}
	process.stdin.resume();
	process.stdin.setEncoding('utf8');

	// Initial render
	render();

	// Fire initial command (async load, etc.)
	if (program.initCmd) program.initCmd(dispatch);

	let resolveRun: (() => void) | null = null;

	// Handle resize
	process.stdout.on('resize', () => {
		if (!running) return;
		const msg: Msg = {
			type: 'resize',
			cols: process.stdout.columns,
			rows: process.stdout.rows,
		};
		const result = program.update(model, msg, dispatch);
		if (result instanceof Promise) {
			result.then((m) => { model = m; render(); });
		} else {
			model = result;
			render();
		}
	});

	// Handle input
	return new Promise<void>((resolve) => {
		resolveRun = resolve;

		process.stdin.on('data', async (data: string) => {
			if (!running) return;

			const buf = Buffer.from(data, 'utf8');
			const keyMsg = parseKey(buf);

			// Ctrl+C always exits
			if (keyMsg.ctrl && keyMsg.key === 'c') {
				cleanup();
				resolve();
				return;
			}

			try {
				const result = program.update(model, keyMsg, dispatch);
				if (result instanceof Promise) {
					model = await result;
				} else {
					model = result;
				}

				// Check for quit signal
				if ((model as any)?.__quit) {
					cleanup();
					resolve();
					return;
				}

				render();
			} catch (err) {
				cleanup();
				console.error('TUI error:', err);
				resolve();
			}
		});

		// Handle signals
		const onSignal = () => {
			cleanup();
			resolve();
		};
		process.on('SIGINT', onSignal);
		process.on('SIGTERM', onSignal);
	});
}

/** Get current terminal dimensions */
export function termSize(): { cols: number; rows: number } {
	return {
		cols: process.stdout.columns || 80,
		rows: process.stdout.rows || 24,
	};
}
