#!/usr/bin/env node
import { deploy } from './commands/deploy.ts';
import { setup } from './commands/setup.ts';
import { ExecError } from './lib/exec.ts';

const HELP = `omo — setup + deploy helper for omo-reader

Usage:
  ./omo setup    Configure .env interactively (target, paths, auth token)
  ./omo deploy   Build locally, ship image to target, restart container
  ./omo help     Show this message

Run setup once, then deploy as often as you like.
`;

async function main(): Promise<number> {
	const cmd = process.argv[2];
	switch (cmd) {
		case 'setup':
			await setup();
			return 0;
		case 'deploy':
			await deploy();
			return 0;
		case 'help':
		case '--help':
		case '-h':
		case undefined:
			console.log(HELP);
			return 0;
		default:
			console.error(`Unknown command: ${cmd}\n`);
			console.error(HELP);
			return 1;
	}
}

main()
	.then((code) => process.exit(code))
	.catch((err: unknown) => {
		if (err instanceof Error && err.name === 'ExitPromptError') {
			console.log('\nAborted.');
			process.exit(130);
		}
		if (err instanceof ExecError) {
			console.error(`\n✗ ${err.message}`);
			process.exit(1);
		}
		if (err instanceof Error) console.error(`\n✗ ${err.message}`);
		else console.error('\n✗ Unknown error:', err);
		process.exit(1);
	});
