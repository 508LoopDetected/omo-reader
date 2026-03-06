/**
 * Panel layout engine for the TUI.
 * ANSI-aware string helpers, bordered panels, split composition,
 * Nerd Font icons, scrollbar, breadcrumb bar, tab header.
 */

import chalk from 'chalk';
import { colors, stripAnsi } from './ui.js';
import type { WorkEntry } from './api.js';

// ── Nerd Font Icons (BMP PUA — single code unit, 1 cell wide) ──

export const icons = {
	home:    '\uf015',
	library: '\uf02d',
	browse:  '\uf0ac',
	search:  '\uf002',
	sources: '\uf1c0',
	info:    '\uf05a',
	list:    '\uf03a',
	play:    '\uf04b',
	folder:  '\uf07c',
	puzzle:  '\uf12e',
	star:    '\uf005',
	chevron: '\ue0b1',
	network: '\uf0e8',
	manga:   '\uf02d',
	western: '\uf02e',
	webcomic: '\uf0ac',
};

// ── ANSI-Aware String Helpers ──

/** Visible width of a string, ignoring ANSI escape codes. */
export function ansiWidth(str: string): number {
	return stripAnsi(str).length;
}

/**
 * Slice a string by visible character positions, preserving ANSI codes.
 * Returns the substring from visible position `start` to `end`.
 */
export function sliceAnsi(str: string, start: number, end: number): string {
	const parts: string[] = [];
	// Match ANSI sequences and regular characters
	const regex = /(\x1b\[[0-9;]*m)|(.)/g;
	let visPos = 0;
	let activeAnsi = ''; // track open ANSI codes
	let match: RegExpExecArray | null;

	while ((match = regex.exec(str)) !== null) {
		if (match[1]) {
			// ANSI escape sequence
			activeAnsi += match[1];
			if (visPos >= start && visPos < end) {
				parts.push(match[1]);
			}
		} else if (match[2]) {
			// Visible character
			if (visPos >= start && visPos < end) {
				if (parts.length === 0 && activeAnsi) {
					// Prepend any active ANSI codes at the start of our slice
					parts.unshift(activeAnsi);
					activeAnsi = '';
				}
				parts.push(match[2]);
			}
			visPos++;
			if (visPos >= end) break;
		}
	}

	// Reset ANSI at end if we included any styled content
	if (parts.length > 0) {
		parts.push('\x1b[0m');
	}

	return parts.join('');
}

/** Truncate styled text to maxWidth visible chars, adding ellipsis if needed. */
export function truncAnsi(text: string, maxWidth: number): string {
	if (maxWidth <= 0) return '';
	const vis = ansiWidth(text);
	if (vis <= maxWidth) return text;
	if (maxWidth <= 1) return '\u2026';
	return sliceAnsi(text, 0, maxWidth - 1) + '\u2026';
}

/** Right-pad styled text to exact visible width with spaces. */
export function padAnsi(text: string, width: number): string {
	const vis = ansiWidth(text);
	if (vis >= width) return sliceAnsi(text, 0, width);
	return text + ' '.repeat(width - vis);
}

/** Word-wrap plain text to width, optionally re-applying a chalk style. */
export function wrapText(text: string, width: number, style?: chalk.Chalk): string[] {
	if (width <= 0) return [];
	const lines: string[] = [];
	const words = text.split(/\s+/);
	let line = '';

	for (const word of words) {
		if (!word) continue;
		if (line.length === 0) {
			line = word;
		} else if (line.length + 1 + word.length <= width) {
			line += ' ' + word;
		} else {
			lines.push(style ? style(line) : line);
			line = word;
		}
	}
	if (line) {
		lines.push(style ? style(line) : line);
	}

	return lines;
}

// ── Panel Rendering ──

const BOX = {
	tl: '\u256d', tr: '\u256e', bl: '\u2570', br: '\u256f',
	h: '\u2500', v: '\u2502',
};

export interface PanelOpts {
	title?: string;
	active?: boolean;
	width: number;
	height: number;
	/** When provided, renders a scrollbar on the right edge of the content area. */
	scroll?: { total: number; offset: number; visible: number };
}

/** Render a bordered panel with content lines. Returns exactly `height` lines of exactly `width` visible chars. */
export function renderPanel(content: string[], opts: PanelOpts): string[] {
	const { title, active = false, width, height, scroll } = opts;
	if (width < 4 || height < 3) return Array(Math.max(0, height)).fill(' '.repeat(Math.max(0, width)));

	const borderStyle = active ? colors.accent : colors.dimmer;
	const titleStyle = active ? colors.title : colors.dim;
	const innerW = width - 2;
	const innerH = height - 2;
	const lines: string[] = [];

	// Scrollbar calculation
	const hasScrollbar = scroll != null && scroll.total > scroll.visible;
	let thumbStart = 0;
	let thumbSize = 0;
	if (hasScrollbar) {
		thumbSize = Math.max(1, Math.round(scroll.visible / scroll.total * innerH));
		const maxOffset = Math.max(1, scroll.total - scroll.visible);
		thumbStart = Math.round(scroll.offset / maxOffset * (innerH - thumbSize));
	}

	// Top border with title
	let topLine: string;
	if (title) {
		const titleStr = ` ${title} `;
		const titleVis = ansiWidth(titleStr);
		const afterTitle = Math.max(0, innerW - 1 - titleVis);
		topLine = borderStyle(BOX.tl + BOX.h) +
			titleStyle(titleStr) +
			borderStyle(BOX.h.repeat(afterTitle) + BOX.tr);
	} else {
		topLine = borderStyle(BOX.tl + BOX.h.repeat(innerW) + BOX.tr);
	}
	lines.push(topLine);

	// Content lines (with optional scrollbar)
	for (let i = 0; i < innerH; i++) {
		const line = i < content.length ? content[i] : '';
		if (hasScrollbar) {
			const contentW = innerW - 1;
			const padded = padAnsi(line, contentW);
			const isThumb = i >= thumbStart && i < thumbStart + thumbSize;
			const scrollChar = isThumb ? colors.accent('\u2590') : ' ';
			lines.push(borderStyle(BOX.v) + padded + scrollChar + borderStyle(BOX.v));
		} else {
			const padded = padAnsi(line, innerW);
			lines.push(borderStyle(BOX.v) + padded + borderStyle(BOX.v));
		}
	}

	// Bottom border
	lines.push(borderStyle(BOX.bl + BOX.h.repeat(innerW) + BOX.br));

	return lines;
}

// ── Composition ──

/** Merge two sets of lines side by side. Lines are concatenated directly (no gap). */
export function sideBySide(left: string[], right: string[]): string[] {
	const maxLen = Math.max(left.length, right.length);
	const result: string[] = [];
	for (let i = 0; i < maxLen; i++) {
		const l = i < left.length ? left[i] : '';
		const r = i < right.length ? right[i] : '';
		result.push(l + r);
	}
	return result;
}

export interface LayoutDimensions {
	leftWidth: number;
	rightWidth: number;
	panelHeight: number;
	headerRows: number;
	statusRows: number;
}

/** Compute split panel dimensions from terminal size. */
export function computeSplitLayout(
	cols: number,
	rows: number,
	leftRatio: number = 0.45,
	headerRows: number = 0,
	statusRows: number = 1,
): LayoutDimensions {
	const leftWidth = Math.floor(cols * leftRatio);
	const rightWidth = cols - leftWidth;
	const panelHeight = rows - headerRows - statusRows;
	return { leftWidth, rightWidth, panelHeight, headerRows, statusRows };
}

// ── Breadcrumb Bar ──

/** Render a breadcrumb navigation bar with Nerd Font icons. */
export function breadcrumb(segments: Array<{ icon: string; label: string }>, cols: number): string {
	const bg = colors.tabBg;
	const parts = segments.map((s, i) => {
		const isLast = i === segments.length - 1;
		const icon = colors.accent(s.icon);
		const label = isLast ? colors.bold(s.label) : colors.snow(s.label);
		return `${icon} ${label}`;
	});
	const sep = colors.dimmer(` ${icons.chevron} `);
	const content = ' ' + parts.join(sep) + ' ';
	const rawLen = ansiWidth(content);
	const fill = Math.max(0, cols - rawLen);
	return bg(content + ' '.repeat(fill));
}

// ── Tab Bar ──

export interface TabBarItem {
	label: string;
	shortcut: string;
	icon: string;
}

/** Render tab header: logo (when wide enough) + tab labels + separator. */
export function renderTabBar(tabs: TabBarItem[], activeIndex: number, cols: number, rows: number): string[] {
	const bg = colors.tabBg;

	// Logo: duotone split at column 9 ("omo" frost | "tui" accent)
	const SPLIT = 9;
	const LOGO_W = 16;
	const logoText = [
		'\u250c\u2500\u2510\u250c\u252c\u2510\u250c\u2500\u2510\u250c\u252c\u2510\u252c \u252c\u252c',
		'\u2502 \u2502\u2502\u2502\u2502\u2502 \u2502 \u2502 \u2502 \u2502\u2502',
		'\u2514\u2500\u2518\u2534 \u2534\u2514\u2500\u2518 \u2534 \u2514\u2500\u2518\u2534',
	];

	const showLogo = cols >= 96;
	const tabOffset = 2;

	// ── Tab labels with position tracking ──
	let labelContent = '';
	const positions: { start: number; end: number }[] = [];
	let pos = tabOffset;

	for (let i = 0; i < tabs.length; i++) {
		const tab = tabs[i];
		const start = pos;
		const num = colors.frost(tab.shortcut);
		const label = i === activeIndex
			? colors.tabActive(tab.label)
			: colors.tabDim(tab.label);
		const part = `${num} ${label}  `;
		labelContent += part;
		pos += ansiWidth(part);
		positions.push({ start, end: pos - 2 });
	}

	const activePos = positions[activeIndex];
	const aStart = activePos?.start ?? 0;
	const aEnd = activePos?.end ?? 0;

	// Separator line
	const beforeLen = Math.max(0, aStart);
	const activeLen = Math.max(0, aEnd - aStart);
	const afterLen = Math.max(0, cols - aEnd);
	const sepLine =
		colors.dimmer('\u2500'.repeat(beforeLen)) +
		colors.accent('\u2501'.repeat(activeLen)) +
		colors.dimmer('\u2500'.repeat(afterLen));

	if (showLogo) {
		const result: string[] = [];
		const logoL = colors.frost;
		const logoR = colors.accent;
		const grey = chalk.hex('#282c34');


		// Build rounded button rectangles for each tab
		const btnTop: string[] = [];
		const btnMid: string[] = [];
		const btnBot: string[] = [];

		for (let i = 0; i < tabs.length; i++) {
			const tab = tabs[i];
			const isAct = i === activeIndex;
			const innerW = Math.max(tab.label.length + 4, 6);

			const bdr = isAct ? colors.frost : colors.dimmer;
			const indicator = isAct ? colors.accent('\u25cf') : colors.snow(tab.shortcut);
			const lbl = isAct ? colors.bold(tab.label) : colors.dim(tab.label);

			// Top border: ╭───────────╮ (plain)
			btnTop.push(bdr('\u256d' + '\u2500'.repeat(innerW) + '\u256e'));

			// Content: │ ●/N Label │ (dot replaces number when active)
			const padR = Math.max(0, innerW - 3 - tab.label.length);
			btnMid.push(bdr('\u2502') + ' ' + indicator + ' ' + lbl + ' '.repeat(padR) + bdr('\u2502'));

			// Bottom border: ╰───────────╯
			btnBot.push(bdr('\u2570' + '\u2500'.repeat(innerW) + '\u256f'));
		}

		// Stripe through button mids; dither gradient using scheme grey
		const barCol = chalk.hex('#3e4451');
		const barBg = chalk.bgHex('#3e4451');

		// 4-step dither gradient: █▓▒░ (single color, density does the fading)
		const LGRAD_W = 4;
		const lGrad = barCol('\u2588\u2593\u2592\u2591');
		const rGrad = barCol('\u2591\u2592\u2593\u2588');

		// Button gaps: dark-light-dark on mid line only
		const btTopBar = btnTop.join('   ') + '  ';
		const btBotBar = btnBot.join('   ') + '  ';

		// Button mid: ▒▓▒ pattern (each 1 shade darker)
		const midGap = barCol('\u2592\u2593\u2592');
		const btMidBar = btnMid.join(midGap) + barBg('  ');

		// Padding to align logo + buttons across gradient/non-gradient lines
		const lPad = ' '.repeat(LGRAD_W + 1);       // 5 spaces (matches gradient + space)
		const btnPad = ' '.repeat(LGRAD_W + 3);      // 7 spaces (matches space + rGrad + fill)
		const blankLogo = ' '.repeat(LOGO_W);

		// Line 0: logo top + btTopBar
		const line0 = logoText[0];
		result.push(
			lPad + logoL(line0.substring(0, SPLIT)) + logoR(line0.substring(SPLIT)) +
			btnPad + btTopBar
		);

		// Line 1: gradient + logo mid + gradient + stripe + btMidBar (fills to cols, fades out)
		const line1 = logoText[1];
		const barFade = barCol('\u2588\u2593\u2592\u2591');  // █▓▒░ fade out
		const midCore =
			lGrad + ' ' + logoL(line1.substring(0, SPLIT)) + logoR(line1.substring(SPLIT)) + ' ' +
			rGrad + barBg('  ') + btMidBar;
		const midFill = Math.max(0, cols - ansiWidth(midCore) - LGRAD_W);
		result.push(midCore + barBg(' '.repeat(midFill)) + barFade);

		// Line 2: logo bot + btBotBar
		const line2 = logoText[2];
		result.push(
			lPad + logoL(line2.substring(0, SPLIT)) + logoR(line2.substring(SPLIT)) +
			btnPad + btBotBar
		);

		result.push('');
		return result;
	}

	// ── Fallback: plain 2-line tab bar ──
	return [bg(padAnsi('  ' + labelContent, cols)), sepLine];
}

// ── Column Width Algorithm ──

export interface ColumnWidthDef {
	minWidth: number;
	growWeight: number;
}

/**
 * Compute column widths with proportional distribution.
 * If total minWidths exceed totalWidth, returns 0 for non-focused columns (narrow fallback).
 */
export function computeColumnWidths(columns: ColumnWidthDef[], totalWidth: number, focusedColumn: number): number[] {
	if (columns.length === 0) return [];
	if (columns.length === 1) return [totalWidth];

	const totalMinWidth = columns.reduce((s, c) => s + c.minWidth, 0);

	// Narrow fallback: only show focused column
	if (totalMinWidth > totalWidth) {
		return columns.map((_, i) => i === focusedColumn ? totalWidth : 0);
	}

	const remaining = totalWidth - totalMinWidth;
	const totalWeight = columns.reduce((s, c) => s + c.growWeight, 0);

	const widths = columns.map(c => {
		const extra = totalWeight > 0 ? Math.floor(remaining * c.growWeight / totalWeight) : 0;
		return c.minWidth + extra;
	});

	// Distribute rounding remainder to last column
	const allocated = widths.reduce((s, w) => s + w, 0);
	if (allocated < totalWidth) {
		widths[widths.length - 1] += totalWidth - allocated;
	}

	return widths;
}

// ── Overlay Compositing ──

/** Dim all lines by stripping ANSI and re-applying dimmer color. */
export function dimLines(lines: string[]): string[] {
	return lines.map(line => colors.dimmer(stripAnsi(line)));
}

/**
 * Composite an overlay panel (string[]) centered on a dimmed background.
 * Returns exactly `rows` lines of `cols` visible width.
 */
export function renderOverlay(background: string[], overlay: string[], cols: number, rows: number): string[] {
	// Dim the background
	const dimmed = dimLines(background);

	// Ensure we have enough background lines
	while (dimmed.length < rows) {
		dimmed.push(' '.repeat(cols));
	}

	const overlayH = overlay.length;
	const overlayW = overlay.length > 0 ? ansiWidth(overlay[0]) : 0;

	// Center the overlay
	const topOffset = Math.max(0, Math.floor((rows - overlayH) / 2));
	const leftOffset = Math.max(0, Math.floor((cols - overlayW) / 2));

	const result = [...dimmed.slice(0, rows)];

	for (let i = 0; i < overlayH; i++) {
		const row = topOffset + i;
		if (row >= rows) break;

		const bgLine = result[row];
		const olLine = overlay[i];
		const olWidth = ansiWidth(olLine);

		// Compose: background left + overlay + background right
		const left = sliceAnsi(bgLine, 0, leftOffset);
		const right = sliceAnsi(bgLine, leftOffset + olWidth, cols);

		// Pad left if needed
		const leftPad = leftOffset - ansiWidth(left);
		const paddedLeft = leftPad > 0 ? left + ' '.repeat(leftPad) : left;

		result[row] = paddedLeft + olLine + right;
	}

	return result;
}

// ── Multi-Column Composition ──

/** Merge multiple column line arrays side by side. */
export function mergeColumns(columns: string[][]): string[] {
	if (columns.length === 0) return [];
	const maxLen = Math.max(...columns.map(c => c.length));
	const result: string[] = [];
	for (let i = 0; i < maxLen; i++) {
		let line = '';
		for (const col of columns) {
			line += i < col.length ? col[i] : '';
		}
		result.push(line);
	}
	return result;
}

// ── Shared Content Builders ──

/** Build a work preview panel content (title, author, status, genres, wrapped description). */
export function workPreview(work: WorkEntry | { title: string; author?: string; description?: string; genres?: string | string[]; status?: string } | null, width: number): string[] {
	if (!work) return [colors.dim(' No selection')];

	const lines: string[] = [];
	const innerW = width;

	// Title
	lines.push(truncAnsi(colors.title(work.title), innerW));
	lines.push('');

	// Author
	if (work.author) {
		lines.push(truncAnsi(colors.frost(work.author), innerW));
	}

	// Status
	if (work.status) {
		lines.push(truncAnsi(colors.dim(work.status), innerW));
	}

	if (work.author || work.status) lines.push('');

	// Genres
	const genres = work.genres;
	if (genres) {
		let genreList: string[];
		if (typeof genres === 'string') {
			genreList = genres.split(',').map(g => g.trim()).filter(Boolean);
		} else {
			genreList = genres;
		}
		if (genreList.length > 0) {
			const genreStr = genreList.slice(0, 8).join(', ');
			const wrapped = wrapText(genreStr, innerW, colors.dim);
			lines.push(...wrapped);
			lines.push('');
		}
	}

	// Description
	if (work.description) {
		// Strip HTML tags and collapse whitespace
		const clean = work.description
			.replace(/<[^>]*>/g, '')
			.replace(/\s+/g, ' ')
			.trim();
		if (clean) {
			const wrapped = wrapText(clean, innerW, colors.dim);
			lines.push(...wrapped);
		}
	}

	return lines;
}

/** Build source info panel content. */
export function sourceInfo(source: { name: string; type: string; lang: string; baseUrl?: string; connected?: boolean } | null, width: number): string[] {
	if (!source) return [colors.dim(' No selection')];

	const typeIcon = source.type === 'native' ? icons.star
		: source.type === 'local' ? icons.folder
		: source.type === 'smb' ? icons.network
		: icons.puzzle;

	const lines: string[] = [];
	lines.push(truncAnsi(colors.title(source.name), width));
	lines.push('');
	lines.push(truncAnsi(`${colors.dim('Type:')} ${colors.accent(typeIcon)} ${colors.snow(source.type)}`, width));
	lines.push(truncAnsi(`${colors.dim('Language:')} ${colors.snow(source.lang)}`, width));
	if (source.type === 'smb') {
		const status = source.connected
			? chalk.green('\u25cf Connected')
			: chalk.red('\u25cf Disconnected');
		lines.push(truncAnsi(`${colors.dim('Status:')} ${status}`, width));
	}
	if (source.baseUrl) {
		lines.push('');
		lines.push(truncAnsi(colors.dim(source.baseUrl), width));
	}

	return lines;
}
