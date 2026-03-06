/**
 * DOM parser bridge for Mangayomi extensions.
 * Wraps cheerio to provide Document/Element APIs that extensions expect.
 *
 * Extension usage:
 *   const doc = new Document(htmlString);
 *   doc.select("css-selector")       -> Element[]
 *   doc.selectFirst("css-selector")  -> Element | null
 *   element.text                     -> string
 *   element.attr("href")             -> string
 *   element.getSrc / getHref / getDataSrc (getter properties)
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';

type AnyNode = Parameters<typeof cheerio.load>[0] extends string | infer N | (infer N)[] | Buffer ? N : never;

class BridgeElement {
	private $: CheerioAPI;
	private el: Cheerio<AnyNode>;

	constructor($: CheerioAPI, el: Cheerio<AnyNode>) {
		this.$ = $;
		this.el = el;
	}

	get text(): string {
		return this.el.text().trim();
	}

	get outerHtml(): string {
		return this.$.html(this.el) ?? '';
	}

	get innerHtml(): string {
		return this.el.html() ?? '';
	}

	get className(): string {
		return this.el.attr('class') ?? '';
	}

	get localName(): string {
		const node = this.el.get(0);
		if (node && 'tagName' in node) {
			return (node as unknown as { tagName: string }).tagName?.toLowerCase() ?? '';
		}
		return '';
	}

	get getSrc(): string {
		return this.el.attr('src') ?? '';
	}

	get getHref(): string {
		return this.el.attr('href') ?? '';
	}

	get getImg(): string {
		// Try src, then data-src, then data-lazy-src
		return this.el.attr('src') ?? this.el.attr('data-src') ?? this.el.attr('data-lazy-src') ?? '';
	}

	get getDataSrc(): string {
		return this.el.attr('data-src') ?? '';
	}

	get previousElementSibling(): BridgeElement | null {
		const prev = this.el.prev();
		if (prev.length === 0) return null;
		return new BridgeElement(this.$, prev);
	}

	get nextElementSibling(): BridgeElement | null {
		const next = this.el.next();
		if (next.length === 0) return null;
		return new BridgeElement(this.$, next);
	}

	get children(): BridgeElement[] {
		const result: BridgeElement[] = [];
		this.el.children().each((_, child) => {
			result.push(new BridgeElement(this.$, this.$(child)));
		});
		return result;
	}

	get parent(): BridgeElement | null {
		const p = this.el.parent();
		if (p.length === 0) return null;
		return new BridgeElement(this.$, p);
	}

	select(selector: string): BridgeElement[] {
		const result: BridgeElement[] = [];
		this.el.find(selector).each((_, el) => {
			result.push(new BridgeElement(this.$, this.$(el)));
		});
		return result;
	}

	selectFirst(selector: string): BridgeElement | null {
		const found = this.el.find(selector).first();
		if (found.length === 0) return null;
		return new BridgeElement(this.$, found);
	}

	attr(name: string): string {
		return this.el.attr(name) ?? '';
	}

	hasAttr(name: string): boolean {
		return this.el.attr(name) !== undefined;
	}

	getElementsByTagName(tag: string): BridgeElement[] {
		return this.select(tag);
	}

	getElementsByClassName(cls: string): BridgeElement[] {
		return this.select(`.${cls}`);
	}

	getElementById(id: string): BridgeElement | null {
		return this.selectFirst(`#${id}`);
	}
}

/** Create the Document class constructor for injection into the vm sandbox. */
export function createDocumentClass() {
	return class Document {
		private $: CheerioAPI;
		private root: BridgeElement;

		constructor(html: string) {
			this.$ = cheerio.load(html);
			this.root = new BridgeElement(this.$, this.$('html'));
		}

		get body(): BridgeElement {
			return new BridgeElement(this.$, this.$('body'));
		}

		get text(): string {
			return this.root.text;
		}

		get outerHtml(): string {
			return this.$.html() ?? '';
		}

		get children(): BridgeElement[] {
			return this.root.children;
		}

		select(selector: string): BridgeElement[] {
			const result: BridgeElement[] = [];
			this.$(selector).each((_, el) => {
				result.push(new BridgeElement(this.$, this.$(el)));
			});
			return result;
		}

		selectFirst(selector: string): BridgeElement | null {
			const found = this.$(selector).first();
			if (found.length === 0) return null;
			return new BridgeElement(this.$, found);
		}

		getElementById(id: string): BridgeElement | null {
			return this.selectFirst(`#${id}`);
		}

		getElementsByClassName(cls: string): BridgeElement[] {
			return this.select(`.${cls}`);
		}

		getElementsByTagName(tag: string): BridgeElement[] {
			return this.select(tag);
		}

		attr(name: string): string {
			return this.root.attr(name);
		}

		hasAttr(name: string): boolean {
			return this.root.hasAttr(name);
		}

		// xpath is rarely used by JS extensions, provide a stub
		xpath(_expr: string): null {
			console.warn('xpath() is not implemented in the bridge');
			return null;
		}

		xpathFirst(_expr: string): string {
			console.warn('xpathFirst() is not implemented in the bridge');
			return '';
		}
	};
}
