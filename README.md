# omo

Comic and manga reader with a desktop GUI (**omogui**) and a terminal UI (**omotui**).

## What it does

- **Sources**: local directories (folders, CBZ, CBR), SMB/Samba shares, MangaDex, xkcd, Mangayomi JS extensions; recursive group detection automatically handles nested directory structures at any depth
- **Library**: organize into typed libraries (manga, western, webcomic) and cross-library collections; search, sort, per-chapter progress tracking; bulk-add from local/SMB sources; inline management via contextual gear toggles on each page
- **Reader**: two-page spread, single page, vertical scroll; RTL/LTR, cover page offset; keyboard/mouse nav; auto-saves progress per chapter
- **Settings cascade**: reader direction, cover page offset, and cover art mode are configurable per title, per collection, per library, or globally, with each level inheriting from the one above
- **NSFW filtering**: flag individual titles or entire libraries as NSFW; a global SFW/All/NSFW filter controls visibility across the sidebar, home page, and all title queries
- **Extensions**: Mangayomi-compatible JS extensions from configurable repos
- **Thumbnails**: cover images resized to WebP and cached locally (optional `sharp`, falls back to full-size)

## Apps

**omogui** is a native desktop window (Electron). **omotui** is a full keyboard-driven terminal UI with (hopefully intuitive) navigation. The TUI reader opens in the default browser.

Both apps have the same features: Home, Library, Sources, Search, Extensions, Settings, and a chapter reader.

## Installation

### From release binaries

```sh
curl -fsSL https://raw.githubusercontent.com/508LoopDetected/omo-reader/main/install.sh | bash
```

The installer detects your platform, downloads the appropriate binary and SPA assets, and installs to `~/.local/bin/`. On Linux it also creates a `.desktop` entry.

Supported platforms: Linux (x86_64, arm64), macOS (x86_64, arm64), Windows (x86_64).

### From source

Requires [Node.js](https://nodejs.org) (v22+).

```sh
npm install
npm run build:all    # build both omogui and omotui
```

## Development

```sh
npm install
npm run dev                          # vite dev server (GUI)
npm run tui                          # terminal UI
npm run build                        # build static SPA
npx svelte-check --threshold error   # type check
```

### Other dependencies

- `smbclient` (from `samba-client` or equivalent) for SMB share support
- `sharp` (optional) for thumbnail generation; falls back to full-size images if unavailable

## Data

| Path | Purpose |
|------|---------|
| `~/.local/share/omo-reader/omo-reader.db` | SQLite database (library, progress, settings) |
| `~/.cache/omo-reader/thumbnails/` | WebP thumbnail cache (safe to delete) |

Overridable via `OMO_DB_PATH`, `OMO_READER_DIR`, `OMO_GUI_DIR` environment variables.
