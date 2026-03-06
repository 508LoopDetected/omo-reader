/**
 * Unified archive extraction for CBZ (ZIP) and CBR (RAR) files.
 * Single source of truth — used by both local and SMB sources.
 */

import { readFile } from 'fs/promises';
import { readFileSync } from 'fs';
import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';
import { createExtractorFromData } from 'node-unrar-js';
import { extname } from 'path';

// ── Pre-load unrar WASM binary ──
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
let _unrarWasm: ArrayBuffer | undefined;
function getUnrarWasm(): ArrayBuffer {
	if (!_unrarWasm) {
		const wasmPath = _require.resolve('node-unrar-js/dist/js/unrar.wasm');
		_unrarWasm = new Uint8Array(readFileSync(wasmPath)).buffer;
	}
	return _unrarWasm;
}

// ── Shared constants ──

export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']);

export const ARCHIVE_EXTENSIONS = new Set(['.cbz', '.cbr', '.zip', '.rar']);

export function isImageFile(filename: string): boolean {
	const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
	return IMAGE_EXTENSIONS.has(ext);
}

export function isArchiveFile(filename: string): boolean {
	return ARCHIVE_EXTENSIONS.has(extname(filename).toLowerCase());
}

export function naturalSort(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// ── Format detection ──

function isRarFormat(input: string | Buffer): boolean {
	if (typeof input === 'string') {
		const ext = extname(input).toLowerCase();
		return ext === '.cbr' || ext === '.rar';
	}
	// Magic bytes: RAR files start with "Rar!" (0x52 0x61 0x72 0x21)
	return input.length >= 4 && input[0] === 0x52 && input[1] === 0x61 && input[2] === 0x72 && input[3] === 0x21;
}

// ── File-path API (local sources) ──

export async function listArchivePages(filePath: string): Promise<string[]> {
	const buffer = await readFile(filePath);
	return listArchivePagesFromBuffer(buffer);
}

export async function extractArchivePage(filePath: string, pageName: string): Promise<Buffer> {
	const buffer = await readFile(filePath);
	return extractArchivePageFromBuffer(buffer, pageName);
}

// ── Buffer API (works for both local and SMB) ──

export async function listArchivePagesFromBuffer(buffer: Buffer): Promise<string[]> {
	if (isRarFormat(buffer)) {
		return listCbrPages(buffer);
	}
	return listCbzPages(buffer);
}

export async function extractArchivePageFromBuffer(buffer: Buffer, pageName: string): Promise<Buffer> {
	if (isRarFormat(buffer)) {
		return extractCbrPage(buffer, pageName);
	}
	return extractCbzPage(buffer, pageName);
}

// ── CBZ (ZIP) internals ──

function listCbzPages(buffer: Buffer): Promise<string[]> {
	return new Promise((resolve, reject) => {
		yauzl.fromBuffer(buffer, { lazyEntries: true }, (err: Error | null, zipfile: ZipFile | undefined) => {
			if (err || !zipfile) return reject(err ?? new Error('Failed to open CBZ'));

			const pages: string[] = [];
			zipfile.readEntry();

			zipfile.on('entry', (entry: Entry) => {
				if (!entry.fileName.startsWith('__MACOSX') && isImageFile(entry.fileName)) {
					pages.push(entry.fileName);
				}
				zipfile.readEntry();
			});

			zipfile.on('end', () => {
				pages.sort(naturalSort);
				resolve(pages);
			});

			zipfile.on('error', reject);
		});
	});
}

function extractCbzPage(buffer: Buffer, pageName: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		yauzl.fromBuffer(buffer, { lazyEntries: true }, (err: Error | null, zipfile: ZipFile | undefined) => {
			if (err || !zipfile) return reject(err ?? new Error('Failed to open CBZ'));

			zipfile.readEntry();

			zipfile.on('entry', (entry: Entry) => {
				if (entry.fileName === pageName) {
					zipfile.openReadStream(entry, (err2: Error | null, stream: NodeJS.ReadableStream | undefined) => {
						if (err2 || !stream) return reject(err2 ?? new Error('Failed to read entry'));
						const chunks: Buffer[] = [];
						stream.on('data', (chunk: Buffer) => chunks.push(chunk));
						stream.on('end', () => resolve(Buffer.concat(chunks)));
						stream.on('error', reject);
					});
				} else {
					zipfile.readEntry();
				}
			});

			zipfile.on('end', () => {
				reject(new Error(`Page not found in archive: ${pageName}`));
			});

			zipfile.on('error', reject);
		});
	});
}

// ── CBR (RAR) internals ──

async function listCbrPages(buffer: Buffer): Promise<string[]> {
	const extractor = await createExtractorFromData({ wasmBinary: getUnrarWasm(), data: buffer.buffer as ArrayBuffer });
	const list = extractor.getFileList();
	const pages: string[] = [];

	for (const header of list.fileHeaders) {
		if (!header.flags.directory && isImageFile(header.name)) {
			pages.push(header.name);
		}
	}

	pages.sort(naturalSort);
	return pages;
}

async function extractCbrPage(buffer: Buffer, pageName: string): Promise<Buffer> {
	const extractor = await createExtractorFromData({ wasmBinary: getUnrarWasm(), data: buffer.buffer as ArrayBuffer });
	const extracted = extractor.extract({ files: [pageName] });

	for (const file of extracted.files) {
		if (file.fileHeader.name === pageName && file.extraction) {
			return Buffer.from(file.extraction);
		}
	}

	throw new Error(`Page not found in archive: ${pageName}`);
}
