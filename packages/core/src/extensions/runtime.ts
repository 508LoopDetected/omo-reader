/**
 * VM sandbox runtime for Mangayomi JS extensions.
 *
 * Creates a Node.js vm context with all bridge classes injected,
 * evaluates the extension code, and returns a callable extension instance.
 */

import vm from 'node:vm';
import { createClientClass } from './bridge/client.js';
import { createDocumentClass } from './bridge/document.js';
import { createSharedPreferencesClass } from './bridge/preferences.js';
import {
	getStringPrototypeExtensions,
	encryptAESCryptoJS,
	decryptAESCryptoJS,
	cryptoHandler,
	unpackJs,
} from './bridge/crypto.js';

export interface ExtensionSourceMeta {
	id: string;
	name: string;
	baseUrl: string;
	lang: string;
	apiUrl: string;
	isFullData: boolean;
	hasCloudflare: boolean;
	dateFormat: string;
	dateFormatLocale: string;
	additionalParams: string;
	notes: string;
}

export interface ExtensionInstance {
	getPopular(page: number): Promise<unknown>;
	getLatestUpdates(page: number): Promise<unknown>;
	search(query: string, page: number, filters: unknown[]): Promise<unknown>;
	getDetail(url: string): Promise<unknown>;
	getPageList(url: string): Promise<unknown>;
	getFilterList(): unknown[];
	getSourcePreferences(): unknown[];
	getHeaders(url: string): Record<string, string>;
}

/**
 * Create a sandboxed extension instance from JS source code.
 */
export function createExtensionRuntime(
	jsCode: string,
	sourceMeta: ExtensionSourceMeta,
): ExtensionInstance {
	const sourceJson = JSON.stringify(sourceMeta);

	// Build the MProvider base class that extensions extend
	const mProviderCode = `
		class MProvider {
			get source() {
				return JSON.parse('${sourceJson.replace(/'/g, "\\'")}');
			}
			get supportsLatest() { return true; }
			getHeaders(url) { return {}; }
			async getPopular(page) { throw new Error("getPopular not implemented"); }
			async getLatestUpdates(page) { throw new Error("getLatestUpdates not implemented"); }
			async search(query, page, filters) { throw new Error("search not implemented"); }
			async getDetail(url) { throw new Error("getDetail not implemented"); }
			async getPageList(url) { throw new Error("getPageList not implemented"); }
			getFilterList() { return []; }
			getSourcePreferences() { return []; }
		}
	`;

	// Create the vm context with all bridge classes
	const context: Record<string, unknown> = {
		// Bridge classes
		Client: createClientClass(),
		Document: createDocumentClass(),
		SharedPreferences: createSharedPreferencesClass(sourceMeta.id),

		// Crypto/utility functions
		encryptAESCryptoJS,
		decryptAESCryptoJS,
		cryptoHandler,
		unpackJs,
		deobfuscateJsPassword: (s: string) => s, // stub — rarely used

		// Standard globals
		console: {
			log: (...args: unknown[]) => console.log(`[ext:${sourceMeta.name}]`, ...args),
			warn: (...args: unknown[]) => console.warn(`[ext:${sourceMeta.name}]`, ...args),
			error: (...args: unknown[]) => console.error(`[ext:${sourceMeta.name}]`, ...args),
		},
		JSON,
		parseInt,
		parseFloat,
		isNaN,
		isFinite,
		encodeURIComponent,
		decodeURIComponent,
		encodeURI,
		decodeURI,
		atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
		btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
		String,
		Number,
		Boolean,
		Array,
		Object,
		Map,
		Set,
		RegExp,
		Date,
		Error,
		TypeError,
		RangeError,
		Promise,
		Math,
		Symbol,
		URL,
		URLSearchParams,
		setTimeout: globalThis.setTimeout,
		clearTimeout: globalThis.clearTimeout,
		Buffer,
	};

	vm.createContext(context);

	// Install String.prototype extensions
	const stringExts = getStringPrototypeExtensions();
	const stringExtCode = Object.entries(stringExts)
		.map(([name]) => `
			String.prototype.${name} = function(...args) {
				return __stringExt_${name}.call(this, ...args);
			};
		`)
		.join('\n');

	for (const [name, fn] of Object.entries(stringExts)) {
		(context as Record<string, unknown>)[`__stringExt_${name}`] = fn;
	}

	// Evaluate in order: string extensions, MProvider, extension code, instantiation
	const fullCode = `
		${stringExtCode}
		${mProviderCode}
		${jsCode}
		var extension = new DefaultExtension();
	`;

	vm.runInContext(fullCode, context, { timeout: 10000 });

	// Create wrapper that calls extension methods and returns results
	return {
		async getPopular(page: number): Promise<unknown> {
			return vm.runInContext(
				`(async () => await extention.getPopular(${page}))()`,
				context,
				{ timeout: 30000 },
			);
		},

		async getLatestUpdates(page: number): Promise<unknown> {
			return vm.runInContext(
				`(async () => await extention.getLatestUpdates(${page}))()`,
				context,
				{ timeout: 30000 },
			);
		},

		async search(query: string, page: number, filters: unknown[]): Promise<unknown> {
			(context as Record<string, unknown>).__searchQuery = query;
			(context as Record<string, unknown>).__searchPage = page;
			(context as Record<string, unknown>).__searchFilters = filters;
			return vm.runInContext(
				`(async () => await extention.search(__searchQuery, __searchPage, __searchFilters))()`,
				context,
				{ timeout: 30000 },
			);
		},

		async getDetail(url: string): Promise<unknown> {
			(context as Record<string, unknown>).__detailUrl = url;
			return vm.runInContext(
				`(async () => await extention.getDetail(__detailUrl))()`,
				context,
				{ timeout: 30000 },
			);
		},

		async getPageList(url: string): Promise<unknown> {
			(context as Record<string, unknown>).__pageListUrl = url;
			return vm.runInContext(
				`(async () => await extention.getPageList(__pageListUrl))()`,
				context,
				{ timeout: 30000 },
			);
		},

		getFilterList(): unknown[] {
			const result = vm.runInContext(
				`extention.getFilterList()`,
				context,
				{ timeout: 5000 },
			);
			return (result as unknown[]) ?? [];
		},

		getSourcePreferences(): unknown[] {
			try {
				const result = vm.runInContext(
					`extention.getSourcePreferences()`,
					context,
					{ timeout: 5000 },
				);
				return (result as unknown[]) ?? [];
			} catch {
				return [];
			}
		},

		getHeaders(url: string): Record<string, string> {
			try {
				(context as Record<string, unknown>).__headersUrl = url;
				const result = vm.runInContext(
					`extention.getHeaders(__headersUrl)`,
					context,
					{ timeout: 5000 },
				);
				return (result as Record<string, string>) ?? {};
			} catch {
				return {};
			}
		},
	};
}
