/**
 * Source registry — singleton Map-based store for all ContentSource implementations.
 * Sources register eagerly at import time; API routes resolve by sourceId.
 */

import type { ContentSource } from './source-interface.js';
import type { Source } from '../types/work.js';

class SourceRegistry {
	private sources = new Map<string, ContentSource>();

	register(source: ContentSource): void {
		this.sources.set(source.id, source);
	}

	unregister(id: string): void {
		this.sources.delete(id);
	}

	get(id: string): ContentSource | undefined {
		return this.sources.get(id);
	}

	has(id: string): boolean {
		return this.sources.has(id);
	}

	getAll(): Source[] {
		return Array.from(this.sources.values()).map((s) => ({
			id: s.id,
			name: s.name,
			lang: s.lang,
			type: s.type,
			iconUrl: s.iconUrl,
		}));
	}
}

export const registry = new SourceRegistry();
