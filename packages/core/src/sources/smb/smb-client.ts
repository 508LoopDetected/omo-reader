/**
 * SMB client — shells out to the system `smbclient` CLI.
 * No native dependencies or OpenSSL issues; handles mDNS, NTLMv2, etc.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { db } from '../../db/client.js';
import { smbConnections } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const execFileAsync = promisify(execFile);

export interface SmbConnectionConfig {
	id: string;
	label: string;
	host: string;
	share: string;
	path: string;
	domain: string;
	username: string;
	password: string;
	enabled: boolean;
}

export interface SmbDirEntry {
	name: string;
	isDirectory: boolean;
	size: number;
}

const states = new Map<string, boolean>();

// ── DB helpers ──

export function getConnectionConfig(connectionId: string): SmbConnectionConfig | undefined {
	const rows = db.select().from(smbConnections).where(eq(smbConnections.id, connectionId)).all();
	if (rows.length === 0) return undefined;
	const row = rows[0];
	return {
		id: row.id,
		label: row.label,
		host: row.host,
		share: row.share,
		path: row.path ?? '',
		domain: row.domain ?? '',
		username: row.username,
		password: row.password,
		enabled: row.enabled,
	};
}

export function getAllConnections(): SmbConnectionConfig[] {
	return db.select().from(smbConnections).where(eq(smbConnections.enabled, true)).all().map((row) => ({
		id: row.id,
		label: row.label,
		host: row.host,
		share: row.share,
		path: row.path ?? '',
		domain: row.domain ?? '',
		username: row.username,
		password: row.password,
		enabled: row.enabled,
	}));
}

// ── smbclient CLI helpers ──

interface SmbCredentials {
	host: string;
	share: string;
	domain?: string;
	username: string;
	password: string;
}

function buildArgs(creds: SmbCredentials, command: string): string[] {
	const share = `//${creds.host}/${creds.share}`;
	const userPart = creds.domain
		? `${creds.domain}\\${creds.username}%${creds.password}`
		: `${creds.username}%${creds.password}`;
	return [share, '-U', userPart, '-c', command];
}

/**
 * Parse `smbclient ls` output into directory entries.
 * Each line looks like: "  filename                ATTRS    SIZE  Day Mon DD HH:MM:SS YYYY"
 */
function parseLsOutput(stdout: string): SmbDirEntry[] {
	const entries: SmbDirEntry[] = [];
	for (const line of stdout.split('\n')) {
		// Match: 2 leading spaces, filename, 2+ spaces, attrs, spaces, size, spaces, date
		const match = line.match(/^\s{2}(.+?)\s{2,}([A-Z]*)\s+(\d+)\s+\w{3}\s+\w{3}/);
		if (!match) continue;
		const name = match[1].trim();
		if (name === '.' || name === '..') continue;
		entries.push({
			name,
			isDirectory: match[2].includes('D'),
			size: parseInt(match[3], 10),
		});
	}
	return entries;
}

function credsFromConfig(config: SmbConnectionConfig): SmbCredentials {
	return { host: config.host, share: config.share, domain: config.domain, username: config.username, password: config.password };
}

// ── Public API (by connectionId) ──

export async function smbReaddir(connectionId: string, path: string): Promise<SmbDirEntry[]> {
	const config = getConnectionConfig(connectionId);
	if (!config) throw new Error(`SMB connection not found: ${connectionId}`);
	try {
		const result = await smbReaddirRaw(credsFromConfig(config), path);
		states.set(connectionId, true);
		return result;
	} catch (err) {
		states.set(connectionId, false);
		throw err;
	}
}

export async function smbReadFile(connectionId: string, path: string): Promise<Buffer> {
	const config = getConnectionConfig(connectionId);
	if (!config) throw new Error(`SMB connection not found: ${connectionId}`);
	try {
		const result = await smbReadFileRaw(credsFromConfig(config), path);
		states.set(connectionId, true);
		return result;
	} catch (err) {
		states.set(connectionId, false);
		throw err;
	}
}

// ── Path helpers ──

/** Normalize an SMB path: decode URL-encoded chars, convert / to \. */
function normalizeSmbPath(path: string): string {
	try { path = decodeURIComponent(path); } catch { /* already decoded */ }
	return path.replace(/\//g, '\\');
}

// ── Public API (raw credentials, for test-connection form) ──

export async function smbReaddirRaw(creds: SmbCredentials, path: string): Promise<SmbDirEntry[]> {
	const normalized = normalizeSmbPath(path);
	// Use cd + ls instead of ls "path\*" to avoid glob interpretation of [ ] * ? in path names
	const command = normalized ? `cd "${normalized}"; ls` : 'ls';
	const { stdout } = await execFileAsync('smbclient', buildArgs(creds, command));
	return parseLsOutput(stdout);
}

export async function smbReadFileRaw(creds: SmbCredentials, path: string): Promise<Buffer> {
	const normalized = normalizeSmbPath(path);
	// Use cd + get to avoid glob interpretation of [ ] * ? in path names,
	// and write to a temp file since /dev/stdout is unsupported by some smbclient versions.
	const lastSep = normalized.lastIndexOf('\\');
	const dir = lastSep >= 0 ? normalized.substring(0, lastSep) : '';
	const filename = lastSep >= 0 ? normalized.substring(lastSep + 1) : normalized;
	const tmpFile = join(tmpdir(), `omo-smb-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	const command = dir
		? `cd "${dir}"; get "${filename}" "${tmpFile}"`
		: `get "${filename}" "${tmpFile}"`;
	try {
		await execFileAsync('smbclient', buildArgs(creds, command));
		return await readFile(tmpFile);
	} finally {
		unlink(tmpFile).catch(() => {});
	}
}

// ── Connection state ──

export async function testConnection(connectionId: string): Promise<boolean> {
	try {
		const config = getConnectionConfig(connectionId);
		if (!config) return false;
		await smbReaddirRaw(credsFromConfig(config), config.path);
		states.set(connectionId, true);
		return true;
	} catch {
		states.set(connectionId, false);
		return false;
	}
}

export async function testConnectionRaw(creds: SmbCredentials): Promise<{ connected: boolean; error?: string }> {
	try {
		await smbReaddirRaw(creds, '');
		return { connected: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { connected: false, error: msg };
	}
}

export function getConnectionState(connectionId: string): { connected: boolean } {
	return { connected: states.get(connectionId) ?? false };
}

export function refreshConnectionState(connectionId: string): void {
	testConnection(connectionId).catch(() => {});
}

export function removeClient(connectionId: string): void {
	states.delete(connectionId);
}

export function closeAll(): void {
	states.clear();
}
