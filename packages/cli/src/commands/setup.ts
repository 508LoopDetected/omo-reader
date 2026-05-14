import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { confirm, input, password, select } from '@inquirer/prompts';
import {
	type Config,
	type Target,
	generateToken,
	readConfig,
	renderRemoteEnv,
	writeConfig,
} from '../lib/env.ts';

export async function setup(): Promise<void> {
	const existing = readConfig();
	const wasConfigured = Object.keys(existing).length > 0;

	console.log(wasConfigured ? '→ Updating .env (Enter to keep current values)' : '→ Setting up .env');
	console.log('');

	const target = (await select({
		message: 'Where should omo-core run?',
		default: existing.target ?? 'local',
		choices: [
			{ name: 'Local Docker (this machine)', value: 'local' },
			{ name: 'Remote host over SSH', value: 'ssh' },
		],
	})) as Target;

	let deployHost: string | undefined;
	let deployPath: string | undefined;
	if (target === 'ssh') {
		deployHost = await input({
			message: 'SSH target (user@host)?',
			default: existing.deployHost,
			validate: (v) => (v.trim().length > 0 ? true : 'Required'),
		});
		deployPath = await input({
			message: 'Remote path where docker-compose.yml will live?',
			default: existing.deployPath ?? '/volume1/docker/omo',
			validate: (v) => (v.trim().startsWith('/') ? true : 'Use an absolute path'),
		});
	}

	const comicsPath = await input({
		message:
			target === 'local'
				? 'Comics library path (on this machine)?'
				: 'Comics library path (on the remote host)?',
		default: existing.comicsPath,
		validate: (v) => {
			if (!v.trim()) return 'Required';
			if (!v.startsWith('/')) return 'Use an absolute path';
			if (target === 'local') {
				if (!existsSync(v)) return `No such directory: ${v}`;
				if (!statSync(v).isDirectory()) return `Not a directory: ${v}`;
			}
			return true;
		},
	});

	const dataPath = await input({
		message:
			target === 'local'
				? 'Data path (db + thumbnail cache)?'
				: 'Data path on the remote host (db + thumbnail cache)?',
		default: existing.dataPath ?? (target === 'local' ? './data' : '/volume1/docker/omo/data'),
		validate: (v) => (v.trim().length > 0 ? true : 'Required'),
	});

	console.log('');
	console.log(
		'  The auth token gates /api/* with a bearer header. Independent of network-level'
	);
	console.log('  access (Tailscale, VPN) — you can use both, either, or neither.');
	const tokenChoice = await select({
		message: 'Auth token for /api/*?',
		default: existing.authToken ? 'keep' : 'generate',
		choices: [
			...(existing.authToken
				? [{ name: 'Keep current value', value: 'keep' as const }]
				: []),
			{ name: 'Generate a random 64-char token', value: 'generate' as const },
			{ name: 'Paste my own', value: 'paste' as const },
			{ name: 'No token — leave /api/* open', value: 'empty' as const },
		],
	});

	let authToken: string;
	if (tokenChoice === 'keep') authToken = existing.authToken ?? '';
	else if (tokenChoice === 'generate') authToken = generateToken();
	else if (tokenChoice === 'paste') {
		authToken = await password({
			message: 'Token:',
			validate: (v) => (v.trim().length > 0 ? true : 'Empty — pick "Leave empty" instead'),
		});
	} else authToken = '';

	const config: Config = { target, comicsPath, dataPath, authToken, deployHost, deployPath };

	console.log('');
	console.log('Summary:');
	console.log(`  target:    ${target}`);
	if (target === 'ssh') {
		console.log(`  ssh host:  ${deployHost}`);
		console.log(`  ssh path:  ${deployPath}`);
	}
	console.log(`  comics:    ${comicsPath}`);
	console.log(`  data:      ${dataPath}`);
	console.log(
		`  token:     ${authToken ? `${authToken.slice(0, 8)}… (${authToken.length} chars)` : '(empty)'}`
	);
	console.log('');

	const ok = await confirm({ message: 'Write to .env?', default: true });
	if (!ok) {
		console.log('Aborted. Nothing written.');
		return;
	}

	writeConfig(config);
	console.log('✓ Wrote .env');

	if (target === 'ssh') {
		console.log('');
		const bootstrap = await confirm({
			message: `Push runtime config to ${deployHost}:${deployPath}/.env now?`,
			default: true,
		});
		if (bootstrap) await pushRemoteEnv(config);
	}
}

export async function pushRemoteEnv(c: Config): Promise<void> {
	const host = c.deployHost!;
	const dir = c.deployPath!;
	const body = renderRemoteEnv(c);

	// The deploy dir is often root-owned on a NAS. If we can't write directly,
	// offer a one-time `sudo chown` so all future setups + deploys are silent.
	let probe = await probeRemoteWrite(host, dir);

	if (probe.status === 'unreachable') {
		const detail = probe.stderr.trim() || '(no stderr)';
		throw new Error(
			`Can't reach ${host} (ssh exit 255).\n  ssh stderr: ${detail}\n  Try: \`ssh ${host} 'echo ok'\` manually. If that works, the wizard's ssh invocation may be hitting different config — check $PATH / ~/.ssh/config.`
		);
	}

	if (probe.status === 'not-writable') {
		console.log('');
		console.log(`  ${host}:${dir} is not writable as your SSH user.`);
		console.log('  One-time fix: chown the dir to your user so future deploys need no sudo.');
		const fix = await confirm({
			message: 'Run `sudo chown` on the remote now? (you\'ll type your sudo password once)',
			default: true,
		});
		if (!fix) {
			console.log('  Skipped. Re-run `./omo setup` later if you change your mind.');
			return;
		}
		await chownRemoteDir(host, dir);
		probe = await probeRemoteWrite(host, dir);
		if (probe.status !== 'writable') {
			throw new Error(`Still can't write ${dir}/.env after chown (status: ${probe.status}).`);
		}
	}

	console.log(`→ Writing ${host}:${dir}/.env`);
	await pipeRemoteWrite(host, `${dir}/.env`, body);
	await sshRun(host, `chmod 600 ${shQuote(`${dir}/.env`)}`);
	console.log(`✓ Wrote ${host}:${dir}/.env`);
}

function shQuote(s: string): string {
	return `'${s.replace(/'/g, `'\\''`)}'`;
}

type WriteProbe = { status: 'writable' | 'not-writable' } | { status: 'unreachable'; stderr: string };

async function probeRemoteWrite(host: string, dir: string): Promise<WriteProbe> {
	// "Writable" means EITHER (a) the target file itself is writable, OR (b)
	// the parent dir is writable so we can rm+create. The parent-writable case
	// matters on Synology where shared dirs are 777 but inner files may be
	// root-owned — `rm -f && cat >` works without sudo there.
	// BatchMode=yes fails fast instead of falling through to password auth.
	const cmd = `test -w ${shQuote(`${dir}/.env`)} || test -w ${shQuote(dir)}`;
	return new Promise((resolveP) => {
		const child = spawn(
			'ssh',
			['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30', host, cmd],
			{ stdio: ['ignore', 'ignore', 'pipe'] }
		);
		let stderr = '';
		child.stderr!.on('data', (d) => (stderr += d.toString()));
		child.on('error', (e) => resolveP({ status: 'unreachable', stderr: e.message }));
		child.on('close', (code) => {
			if (code === 0) resolveP({ status: 'writable' });
			else if (code === 255) resolveP({ status: 'unreachable', stderr });
			else resolveP({ status: 'not-writable' });
		});
	});
}

function chownRemoteDir(host: string, dir: string): Promise<void> {
	// Allocate a TTY so sudo can prompt for password. We chown the dir AND
	// any pre-existing .env so the unprivileged user can both create and
	// overwrite. Using $LOGNAME on the remote = whoever we're SSH'd in as.
	const cmd = `sudo chown -R "$LOGNAME":users ${shQuote(dir)}`;
	return new Promise((resolveP, rejectP) => {
		const child = spawn('ssh', ['-t', '-o', 'ConnectTimeout=10', host, cmd], {
			stdio: 'inherit',
		});
		child.on('error', rejectP);
		child.on('close', (code) =>
			code === 0
				? resolveP()
				: rejectP(new Error(`sudo chown on remote exited with ${code}`))
		);
	});
}

function sshRun(host: string, remoteCmd: string): Promise<void> {
	return new Promise((resolveP, rejectP) => {
		const child = spawn('ssh', ['-o', 'ConnectTimeout=10', host, remoteCmd], { stdio: 'inherit' });
		child.on('error', rejectP);
		child.on('close', (code) =>
			code === 0 ? resolveP() : rejectP(new Error(`ssh ${remoteCmd} exited with ${code}`))
		);
	});
}

function pipeRemoteWrite(host: string, remotePath: string, content: string): Promise<void> {
	// `rm -f` first so we can replace a root-owned file in a world-writable
	// dir (the common Synology case). Without it, `cat >` truncate would fail
	// with permission denied even though we could unlink + create just fine.
	return new Promise((resolveP, rejectP) => {
		const child = spawn(
			'ssh',
			['-o', 'ConnectTimeout=30', host, `rm -f ${shQuote(remotePath)} && cat > ${shQuote(remotePath)}`],
			{ stdio: ['pipe', 'inherit', 'inherit'] }
		);
		child.on('error', rejectP);
		child.on('close', (code) =>
			code === 0 ? resolveP() : rejectP(new Error(`ssh write to ${remotePath} exited with ${code}`))
		);
		child.stdin!.write(content);
		child.stdin!.end();
	});
}
