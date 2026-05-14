import { spawn, type SpawnOptions } from 'node:child_process';

export class ExecError extends Error {
	constructor(public command: string, public code: number | null, public signal: NodeJS.Signals | null) {
		super(`\`${command}\` exited with ${code ?? signal ?? 'unknown'}`);
	}
}

export function run(
	command: string,
	args: string[],
	options: SpawnOptions = {}
): Promise<void> {
	return new Promise((resolveP, rejectP) => {
		const child = spawn(command, args, { stdio: 'inherit', ...options });
		child.on('error', rejectP);
		child.on('close', (code, signal) => {
			if (code === 0) resolveP();
			else rejectP(new ExecError(`${command} ${args.join(' ')}`, code, signal));
		});
	});
}

export function runShell(shellCommand: string, options: SpawnOptions = {}): Promise<void> {
	return new Promise((resolveP, rejectP) => {
		const child = spawn(shellCommand, { stdio: 'inherit', shell: true, ...options });
		child.on('error', rejectP);
		child.on('close', (code, signal) => {
			if (code === 0) resolveP();
			else rejectP(new ExecError(shellCommand, code, signal));
		});
	});
}

export function capture(command: string, args: string[]): Promise<string> {
	return new Promise((resolveP, rejectP) => {
		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		let out = '';
		let err = '';
		child.stdout!.on('data', (d) => (out += d.toString()));
		child.stderr!.on('data', (d) => (err += d.toString()));
		child.on('error', rejectP);
		child.on('close', (code, signal) => {
			if (code === 0) resolveP(out.trim());
			else {
				const e = new ExecError(`${command} ${args.join(' ')}`, code, signal);
				(e as Error & { stderr?: string }).stderr = err;
				rejectP(e);
			}
		});
	});
}
