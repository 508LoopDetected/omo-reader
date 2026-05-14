import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Config, assertComplete, readConfig } from '../lib/env.ts';
import { ExecError, run } from '../lib/exec.ts';

const IMAGE_TAG = 'omo-core:latest';
const REMOTE_PATH_PREFIX = 'export PATH=/usr/local/bin:$PATH';

export async function deploy(): Promise<void> {
	const config = readConfig();
	assertComplete(config);
	if (config.target === 'local') await deployLocal(config);
	else await deploySsh(config);
}

async function deployLocal(_c: Config): Promise<void> {
	console.log('→ docker compose up -d --build');
	await run('docker', ['compose', 'up', '-d', '--build']);
	console.log('');
	console.log('✓ Deployed. Open http://localhost:3210/');
}

async function deploySsh(c: Config): Promise<void> {
	const host = c.deployHost!;
	const dir = c.deployPath!;
	const hostname = host.includes('@') ? host.split('@')[1] : host;

	console.log(`→ Building ${IMAGE_TAG} locally`);
	await run('docker', ['build', '-t', IMAGE_TAG, '.']);

	console.log('');
	console.log(`→ Shipping image to ${host} via docker save | ssh | docker load`);
	await pipeSaveLoad(host);

	console.log('');
	console.log(`→ Syncing docker-compose.yml to ${host}:${dir}`);
	const composePath = resolve(process.cwd(), 'docker-compose.yml');
	if (!existsSync(composePath)) throw new Error(`Missing docker-compose.yml at ${composePath}`);
	await run('ssh', [host, `mkdir -p ${shQuote(dir)}`]);
	await pipeToRemoteFile(host, `${dir}/docker-compose.yml`, readFileSync(composePath));

	console.log('');
	console.log(`→ Verifying remote .env exists`);
	try {
		await run('ssh', [host, `test -f ${shQuote(`${dir}/.env`)}`]);
	} catch (e) {
		if (e instanceof ExecError) {
			throw new Error(
				`Remote ${dir}/.env not found. Run \`./omo setup\` and accept the 'push runtime config' step.`
			);
		}
		throw e;
	}

	console.log(`→ Starting on ${host}`);
	await run('ssh', [
		host,
		`${REMOTE_PATH_PREFIX} && cd ${shQuote(dir)} && docker compose up -d`,
	]);

	console.log('');
	console.log(`✓ Deployed. Test: curl http://${hostname}:3210/`);
}

function pipeSaveLoad(host: string): Promise<void> {
	// Let bash own the pipeline so the kernel handles fd plumbing — chaining
	// `spawn()` streams through Node has subtle race conditions where the
	// Promise.all can resolve before downstream data flushes. `pipefail` makes
	// any stage's failure propagate to the exit code (default sh would only
	// report the last command's status).
	const remoteCmd = `${REMOTE_PATH_PREFIX} && gunzip | docker load`;
	const pipeline = `set -o pipefail; docker save ${shQuote(IMAGE_TAG)} | gzip | ssh ${shQuote(host)} ${shQuote(remoteCmd)}`;
	return new Promise((resolveP, rejectP) => {
		const child = spawn('bash', ['-c', pipeline], { stdio: 'inherit' });
		child.on('error', rejectP);
		child.on('close', (code) =>
			code === 0
				? resolveP()
				: rejectP(new Error(`save/load pipeline exited with ${code}`))
		);
	});
}

function pipeToRemoteFile(host: string, remotePath: string, content: Buffer | string): Promise<void> {
	// `rm -f` first so we can overwrite a root-owned file in a world-writable
	// dir (Synology pattern). `cat >` alone would fail to truncate it.
	return new Promise((resolveP, rejectP) => {
		const child = spawn(
			'ssh',
			[host, `rm -f ${shQuote(remotePath)} && cat > ${shQuote(remotePath)}`],
			{ stdio: ['pipe', 'inherit', 'inherit'] }
		);
		child.on('error', rejectP);
		child.on('close', (code) => {
			if (code === 0) resolveP();
			else rejectP(new Error(`scp-over-ssh to ${remotePath} exited with ${code}`));
		});
		child.stdin!.write(content);
		child.stdin!.end();
	});
}

function shQuote(s: string): string {
	return `'${s.replace(/'/g, `'\\''`)}'`;
}
