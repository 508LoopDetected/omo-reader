/**
 * Crypto and string utility bridge for Mangayomi extensions.
 *
 * Provides:
 * - String.prototype extensions (substringAfter, substringBefore, etc.)
 * - cryptoHandler, encryptAESCryptoJS, decryptAESCryptoJS
 * - unpackJs (p.a.c.k.e.r unpacker)
 */

import { createHash, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';

/** Install String.prototype extensions into a sandbox context. */
export function getStringPrototypeExtensions(): Record<string, (this: string, ...args: string[]) => string> {
	return {
		substringAfter(delimiter: string): string {
			const idx = this.indexOf(delimiter);
			return idx === -1 ? this : this.substring(idx + delimiter.length);
		},

		substringAfterLast(delimiter: string): string {
			const idx = this.lastIndexOf(delimiter);
			return idx === -1 ? this : this.substring(idx + delimiter.length);
		},

		substringBefore(delimiter: string): string {
			const idx = this.indexOf(delimiter);
			return idx === -1 ? this : this.substring(0, idx);
		},

		substringBeforeLast(delimiter: string): string {
			const idx = this.lastIndexOf(delimiter);
			return idx === -1 ? this : this.substring(0, idx);
		},

		substringBetween(start: string, end: string): string {
			const startIdx = this.indexOf(start);
			if (startIdx === -1) return '';
			const afterStart = startIdx + start.length;
			const endIdx = this.indexOf(end, afterStart);
			if (endIdx === -1) return '';
			return this.substring(afterStart, endIdx);
		},
	};
}

/** AES-CBC encrypt using CryptoJS-compatible key derivation. */
export function encryptAESCryptoJS(plainText: string, passphrase: string): string {
	const salt = Buffer.from(Array.from({ length: 8 }, () => Math.floor(Math.random() * 256)));
	const { key, iv } = evpKdf(passphrase, salt);

	const cipher = createCipheriv('aes-256-cbc', key, iv);
	let encrypted = cipher.update(plainText, 'utf8');
	encrypted = Buffer.concat([encrypted, cipher.final()]);

	const result = Buffer.concat([Buffer.from('Salted__'), salt, encrypted]);
	return result.toString('base64');
}

/** AES-CBC decrypt using CryptoJS-compatible key derivation. */
export function decryptAESCryptoJS(encrypted: string, passphrase: string): string {
	const data = Buffer.from(encrypted, 'base64');
	// Skip 'Salted__' prefix (8 bytes)
	const salt = data.subarray(8, 16);
	const ciphertext = data.subarray(16);

	const { key, iv } = evpKdf(passphrase, salt);

	const decipher = createDecipheriv('aes-256-cbc', key, iv);
	let decrypted = decipher.update(ciphertext);
	decrypted = Buffer.concat([decrypted, decipher.final()]);

	return decrypted.toString('utf8');
}

/** OpenSSL EVP_BytesToKey key derivation (CryptoJS default). */
function evpKdf(passphrase: string, salt: Buffer): { key: Buffer; iv: Buffer } {
	const password = Buffer.from(passphrase, 'utf8');
	const concatenation: Buffer[] = [];
	let prevHash = Buffer.alloc(0);

	while (Buffer.concat(concatenation).length < 48) {
		const data = Buffer.concat([prevHash, password, salt]);
		prevHash = createHash('md5').update(data).digest();
		concatenation.push(prevHash);
	}

	const keyIv = Buffer.concat(concatenation);
	return {
		key: keyIv.subarray(0, 32),
		iv: keyIv.subarray(32, 48),
	};
}

/** Generic crypto handler (AES-CBC with explicit key/IV). */
export function cryptoHandler(
	text: string,
	iv: string,
	secretKeyString: string,
	encrypt: boolean,
): string {
	const key = Buffer.from(secretKeyString, 'utf8');
	const ivBuf = Buffer.from(iv, 'utf8');

	if (encrypt) {
		const cipher = createCipheriv('aes-256-cbc', key, ivBuf);
		let result = cipher.update(text, 'utf8', 'base64');
		result += cipher.final('base64');
		return result;
	} else {
		const decipher = createDecipheriv('aes-256-cbc', key, ivBuf);
		let result = decipher.update(text, 'base64', 'utf8');
		result += decipher.final('utf8');
		return result;
	}
}

/**
 * Unpack p.a.c.k.e.r packed JavaScript.
 * Used by some manga sites to obfuscate their page URLs.
 */
export function unpackJs(packed: string): string {
	// Match eval(function(p,a,c,k,e,d){...}('...',base,count,'...'.split('|')))
	const match = packed.match(
		/eval\(function\(p,a,c,k,e,[dr]\)\{.*?\}\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\('\|'\)/s
	);
	if (!match) return packed;

	const [, p, aStr, cStr, kStr] = match;
	const a = parseInt(aStr);
	const keywords = kStr.split('|');
	let c = parseInt(cStr);

	function baseEncode(num: number): string {
		const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
		if (num < a) {
			const prefix = num >= a ? baseEncode(Math.floor(num / a)) : '';
			const char = num % a;
			return prefix + (char > 35 ? String.fromCharCode(char + 29) : char.toString(36));
		}
		return baseEncode(Math.floor(num / a)) + baseEncode(num % a);
	}

	let result = p;
	while (c--) {
		const encoded = baseEncode(c);
		if (keywords[c]) {
			result = result.replace(new RegExp(`\\b${encoded}\\b`, 'g'), keywords[c]);
		}
	}

	return result;
}
