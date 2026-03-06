/**
 * Shared TUI rendering helpers.
 * Box drawing, truncation, colors, list windowing.
 */

import chalk from 'chalk';

// ── Colors ──

// One Half Dark palette
const accent = chalk.hex('#98c379');       // green — primary accent
const accentBold = chalk.hex('#98c379').bold;
const teal = chalk.hex('#56b6c2');         // cyan
const yellow = chalk.hex('#e5c07b');
const red = chalk.hex('#e06c75');
const orange = chalk.hex('#d19a66');
const frost = chalk.hex('#61afef');        // blue
const purple = chalk.hex('#c678dd');
const snow = chalk.hex('#dcdfe4');
const snowBold = chalk.hex('#dcdfe4').bold;
const dim = chalk.hex('#5a6374');
const dimmer = chalk.hex('#4b5263');
const mid = chalk.hex('#636d83');

export const colors = {
	accent,
	accentBold,
	teal,
	frost,
	purple,
	success: accent,
	warning: yellow,
	error: red,
	orange,
	dim: mid,
	dimmer,
	bold: snowBold,
	title: snowBold,
	selected: accentBold,
	muted: dim,
	snow,
	// Selection: full-row highlight
	selBg: chalk.bgHex('#3e4451'),
	selBgAccent: chalk.bgHex('#3e4451').hex('#98c379').bold,
	// Status bar
	statusBg: chalk.bgHex('#282c34').hex('#636d83'),
	statusKey: chalk.bgHex('#282c34').hex('#61afef'),
	statusNsfw: chalk.bgHex('#282c34').hex('#e06c75'),
	// Tab bar
	tabActive: chalk.hex('#dcdfe4').bold,
	tabDim: chalk.hex('#5a6374'),
	tabBg: chalk.bgHex('#282c34'),
};

// ── String Helpers ──

/** Truncate text to maxWidth, adding ellipsis if needed. */
export function truncate(text: string, maxWidth: number): string {
	if (maxWidth <= 0) return '';
	if (text.length <= maxWidth) return text;
	if (maxWidth <= 3) return text.slice(0, maxWidth);
	return text.slice(0, maxWidth - 1) + '\u2026';
}

/** Right-pad text to width with spaces. */
export function pad(text: string, width: number): string {
	if (text.length >= width) return text.slice(0, width);
	return text + ' '.repeat(width - text.length);
}

/** Center text within width. */
export function center(text: string, width: number): string {
	if (text.length >= width) return text.slice(0, width);
	const left = Math.floor((width - text.length) / 2);
	const right = width - text.length - left;
	return ' '.repeat(left) + text + ' '.repeat(right);
}

/** Repeat a character n times. */
export function repeat(ch: string, n: number): string {
	return n > 0 ? ch.repeat(n) : '';
}

// ── Box Drawing ──

const BOX = {
	tl: '\u256d', tr: '\u256e', bl: '\u2570', br: '\u256f',
	h: '\u2500', v: '\u2502',
	hHeavy: '\u2501',
};

/** Draw a bordered box around content. */
export function box(title: string, content: string, width: number): string {
	const innerW = width - 2;
	const lines: string[] = [];

	const titleStr = title ? ` ${title} ` : '';
	const topFill = innerW - titleStr.length;
	lines.push(
		dimmer(BOX.tl + BOX.h) +
		colors.title(titleStr) +
		dimmer(repeat(BOX.h, topFill) + BOX.tr)
	);

	for (const line of content.split('\n')) {
		const padded = pad(line, innerW);
		lines.push(dimmer(BOX.v) + padded + dimmer(BOX.v));
	}

	lines.push(dimmer(BOX.bl + repeat(BOX.h, innerW) + BOX.br));

	return lines.join('\n');
}

// ── Status Bar ──

/** Render a bottom status/help bar spanning the full width. */
export function statusBar(items: string[], width: number): string {
	const parts = items.map(item => {
		// Highlight key portions (text before space is the key)
		const spaceIdx = item.indexOf(' ');
		if (spaceIdx > 0) {
			const key = item.slice(0, spaceIdx);
			const desc = item.slice(spaceIdx);
			// If desc already has ANSI formatting, just add the status background to the gap space
			const styled = desc !== stripAnsi(desc) ? colors.statusBg(' ') + desc.trimStart() : colors.statusBg(desc);
			return colors.statusKey(key) + styled;
		}
		return colors.statusBg(item);
	});
	const sep = colors.statusBg(' \u2502 ');
	const content = parts.join(sep);
	const rawLen = stripAnsi(content).length;
	const fill = Math.max(0, width - rawLen - 1);
	return colors.statusBg(' ') + content + colors.statusBg(repeat(' ', fill));
}

/** Render a header line with an underline separator. */
export function header(title: string, subtitle: string, width: number): string {
	const left = `  ${colors.title(title)}`;
	const right = subtitle ? `${frost(subtitle)}  ` : '';
	const leftLen = stripAnsi(left).length;
	const rightLen = stripAnsi(right).length;
	const gap = width - leftLen - rightLen;
	const titleLine = gap > 0 ? left + ' '.repeat(gap) + right : left;
	const sep = dimmer('  ' + repeat(BOX.h, Math.max(0, width - 4)));
	return titleLine + '\n' + sep;
}

// ── Selection Row ──

/** Render a list row with optional full-row background highlight. */
export function row(text: string, selected: boolean, width: number): string {
	const rawLen = stripAnsi(text).length;
	const fill = Math.max(0, width - rawLen);
	if (selected) {
		return colors.selBg(text + repeat(' ', fill));
	}
	return text;
}

// ── Badges / Tags ──

export function badge(text: string, color: chalk.Chalk = dim): string {
	return color(`[${text}]`);
}

export function tag(text: string, color: chalk.Chalk = dim): string {
	return color(text);
}

// ── List Windowing ──

export interface WindowResult {
	start: number;
	end: number;
	visibleItems: number[];
}

/**
 * Compute which slice of items to show given a selection index and visible rows.
 * Returns start/end indices for the visible window.
 */
export function listWindow(
	totalItems: number,
	selectedIndex: number,
	visibleRows: number,
): WindowResult {
	if (totalItems === 0) {
		return { start: 0, end: 0, visibleItems: [] };
	}

	const clamped = Math.max(0, Math.min(selectedIndex, totalItems - 1));
	let start: number;

	if (totalItems <= visibleRows) {
		start = 0;
	} else if (clamped < visibleRows / 2) {
		start = 0;
	} else if (clamped > totalItems - visibleRows / 2) {
		start = totalItems - visibleRows;
	} else {
		start = clamped - Math.floor(visibleRows / 2);
	}

	start = Math.max(0, start);
	const end = Math.min(start + visibleRows, totalItems);

	const visibleItems: number[] = [];
	for (let i = start; i < end; i++) {
		visibleItems.push(i);
	}

	return { start, end, visibleItems };
}

// ── Helpers ──

/** Strip ANSI escape codes from a string for length calculation. */
export function stripAnsi(str: string): string {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Build a loading line */
export function loadingLine(message: string = 'Loading...'): string {
	return `  ${colors.dim(message)}`;
}

/** Format a spinner frame (call with incrementing counter) */
const SPINNER = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];
export function spinner(frame: number): string {
	return colors.accent(SPINNER[frame % SPINNER.length]);
}

/** Render a list item with selection indicator. */
export function listItem(text: string, selected: boolean, width: number): string {
	const prefix = selected ? colors.accent(' \u25b8 ') : '   ';
	const content = selected ? colors.selected(text) : colors.snow(text);
	return row(prefix + content, selected, width);
}

/** Build empty state message */
export function emptyState(message: string, width: number): string {
	return '\n' + center(colors.dim(message), width) + '\n';
}

/** Render a separator line. */
export function separator(width: number): string {
	return dimmer('  ' + repeat(BOX.h, Math.max(0, width - 4)));
}

/** Render a small progress bar. */
export function progressBar(current: number, total: number, barWidth: number): string {
	if (total <= 0) return '';
	const pct = Math.min(1, current / total);
	const filled = Math.round(barWidth * pct);
	const empty = barWidth - filled;
	return accent('\u2588'.repeat(filled)) + dimmer('\u2591'.repeat(empty));
}
