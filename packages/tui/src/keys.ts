/**
 * Raw stdin keypress parser.
 * Reads bytes from stdin in raw mode and maps escape sequences to named keys.
 */

export interface KeyMsg {
	type: 'key';
	key: string;     // named key or character
	ctrl: boolean;
	shift: boolean;
	raw: Buffer;
}

export interface ResizeMsg {
	type: 'resize';
	cols: number;
	rows: number;
}

export type Msg = KeyMsg | ResizeMsg;

/** Parse a raw stdin buffer into a KeyMsg. */
export function parseKey(buf: Buffer): KeyMsg {
	const base: KeyMsg = { type: 'key', key: '', ctrl: false, shift: false, raw: buf };

	// Single byte
	if (buf.length === 1) {
		const byte = buf[0];

		// Ctrl+letter (0x01-0x1a except special ones)
		if (byte >= 1 && byte <= 26) {
			const letter = String.fromCharCode(byte + 96); // 0x01 -> 'a'
			if (byte === 3) return { ...base, key: 'c', ctrl: true };
			if (byte === 4) return { ...base, key: 'd', ctrl: true };
			if (byte === 9) return { ...base, key: 'tab', ctrl: false }; // Tab
			if (byte === 13) return { ...base, key: 'enter', ctrl: false }; // Enter
			return { ...base, key: letter, ctrl: true };
		}

		if (byte === 27) return { ...base, key: 'escape' };
		if (byte === 127) return { ...base, key: 'backspace' };
		if (byte === 0) return { ...base, key: 'space', ctrl: true }; // Ctrl+Space

		return { ...base, key: String.fromCharCode(byte) };
	}

	// Escape sequences
	const seq = buf.toString();

	// CSI sequences: ESC [ ...
	if (seq.startsWith('\x1b[')) {
		const code = seq.slice(2);

		// Arrow keys
		if (code === 'A') return { ...base, key: 'up' };
		if (code === 'B') return { ...base, key: 'down' };
		if (code === 'C') return { ...base, key: 'right' };
		if (code === 'D') return { ...base, key: 'left' };

		// Home/End
		if (code === 'H') return { ...base, key: 'home' };
		if (code === 'F') return { ...base, key: 'end' };

		// Page Up/Down
		if (code === '5~') return { ...base, key: 'pageup' };
		if (code === '6~') return { ...base, key: 'pagedown' };

		// Delete/Insert
		if (code === '3~') return { ...base, key: 'delete' };
		if (code === '2~') return { ...base, key: 'insert' };

		// Shift+Arrow
		if (code === '1;2A') return { ...base, key: 'up', shift: true };
		if (code === '1;2B') return { ...base, key: 'down', shift: true };
		if (code === '1;2C') return { ...base, key: 'right', shift: true };
		if (code === '1;2D') return { ...base, key: 'left', shift: true };

		// Ctrl+Arrow
		if (code === '1;5A') return { ...base, key: 'up', ctrl: true };
		if (code === '1;5B') return { ...base, key: 'down', ctrl: true };
		if (code === '1;5C') return { ...base, key: 'right', ctrl: true };
		if (code === '1;5D') return { ...base, key: 'left', ctrl: true };

		// Shift+Tab (backtab)
		if (code === 'Z') return { ...base, key: 'tab', shift: true };

		return { ...base, key: `[${code}]` };
	}

	// SS3 sequences: ESC O ...
	if (seq.startsWith('\x1bO')) {
		const code = seq[2];
		if (code === 'A') return { ...base, key: 'up' };
		if (code === 'B') return { ...base, key: 'down' };
		if (code === 'C') return { ...base, key: 'right' };
		if (code === 'D') return { ...base, key: 'left' };
		if (code === 'H') return { ...base, key: 'home' };
		if (code === 'F') return { ...base, key: 'end' };
		return { ...base, key: `O${code}` };
	}

	// Alt+letter: ESC followed by a printable character
	if (buf.length === 2 && buf[0] === 0x1b && buf[1] >= 0x20) {
		return { ...base, key: String.fromCharCode(buf[1]), ctrl: false };
	}

	// Multi-byte UTF-8 character
	return { ...base, key: seq };
}
