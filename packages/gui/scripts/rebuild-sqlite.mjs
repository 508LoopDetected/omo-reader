// Rebuild better-sqlite3 against Electron's Node ABI. Called by the
// `rebuild:sqlite` npm script before each Electron build. Cross-platform —
// avoids bash `$(...)` substitution that breaks on Windows runners.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronVersion = require('electron/package.json').version;

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqliteDir = join(__dirname, '..', '..', '..', 'node_modules', 'better-sqlite3');

const result = spawnSync(
	'npx',
	[
		'node-gyp',
		'rebuild',
		'--runtime=electron',
		`--target=${electronVersion}`,
		'--dist-url=https://electronjs.org/headers',
	],
	{
		cwd: sqliteDir,
		stdio: 'inherit',
		shell: process.platform === 'win32',
	},
);

process.exit(result.status ?? 1);
