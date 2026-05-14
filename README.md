# omo

Comic and manga reader with a desktop GUI (**omogui**).

## What it does

- **Sources**: local directories (folders, CBZ, CBR), SMB/Samba shares, MangaDex, xkcd, Mangayomi JS extensions; recursive group detection automatically handles nested directory structures at any depth
- **Library**: organize into typed libraries (manga, western, webcomic) and cross-library collections; search, sort, per-chapter progress tracking; bulk-add from local/SMB sources; inline management via contextual gear toggles on each page
- **Reader**: two-page spread, single page, vertical scroll; RTL/LTR, cover page offset; keyboard/mouse nav; auto-saves progress per chapter
- **Settings cascade**: reader direction, cover page offset, and cover art mode are configurable per title, per collection, per library, or globally, with each level inheriting from the one above
- **NSFW filtering**: flag individual titles or entire libraries as NSFW; a global SFW/All/NSFW filter controls visibility across the sidebar, home page, and all title queries
- **Extensions**: Mangayomi-compatible JS extensions from configurable repos
- **Thumbnails**: cover images resized to WebP and cached locally (optional `sharp`, falls back to full-size)

## App

**omogui** is a native desktop window (Electron) with: Home, Library, Sources, Search, Extensions, Settings, and a chapter reader.

The same Svelte SPA can also run **headless on a server** (e.g. NAS) so any device on a private network or VPN (Tailscale, etc.) can access the same library — no per-device install required. See [Self-hosted server](#self-hosted-server) below.

## Installation

### From release binaries

**Linux:**

```sh
curl -fsSL https://raw.githubusercontent.com/508LoopDetected/omo-reader/main/install.sh | bash
```

Downloads the AppImage from the latest GitHub release, installs it to `~/.local/bin/omogui`, and creates a `.desktop` entry.

**macOS / Windows:** download the `.dmg` / `.exe` from the [latest release](https://github.com/508LoopDetected/omo-reader/releases/latest) and run it.

Supported architectures: Linux x64, macOS arm64 (Apple Silicon), Windows x64.

### From source

Requires [Node.js](https://nodejs.org) (v22+).

```sh
./scripts/package.sh   # build the desktop app → packages/gui/dist/
```

On Arch, `./scripts/install-local.sh` chains that with `yay -U` of the resulting `.pacman`.

## Development

```sh
./scripts/dev.sh                     # vite dev server + core subprocess on :3210
./scripts/build.sh                   # build the static SPA only
npx svelte-check --threshold error   # type check
```

Every stage has a single script in `scripts/`:

| Script | Stage |
|--------|-------|
| `dev.sh` | Run the dev server (HMR, core subprocess) |
| `build.sh` | Build the Svelte SPA → `packages/gui/build/` |
| `package.sh` | Build the Electron desktop app → `packages/gui/dist/` |
| `docker.sh` | Build the headless Docker image (`omo-core:latest`) |
| `deploy.sh` | rsync source to a remote host, `docker compose up --build` there |
| `install-local.sh` | `package.sh` + `yay -U` the `.pacman` (Arch convenience) |

### Other dependencies

- `smbclient` (from `samba-client` or equivalent) for SMB share support
- `sharp` (optional) for thumbnail generation; falls back to full-size images if unavailable

### Cutting a release

Push a SemVer tag. The `.github/workflows/release.yml` matrix builds desktop artifacts for Linux/macOS/Windows and uploads them to the GitHub Release matching the tag.

```sh
npm version patch   # or minor / major — bumps packages/*/package.json + tags
git push --follow-tags
```

macOS builds are unsigned (no Apple Developer cert configured); users will see a Gatekeeper warning on first launch.

## Data

| Path | Purpose |
|------|---------|
| `~/.local/share/omo-reader/omo-reader.db` | SQLite database (library, progress, settings, parsed-archive cache) |
| `~/.cache/omo-reader/thumbnails/` | WebP thumbnail cache (safe to delete) |

Overridable via `OMO_DB_PATH`, `OMO_CACHE_PATH`, `OMO_GUI_DIR`, `OMO_LIBRARY_ROOT` environment variables.

## Self-hosted server

`@omo/core` can run as a standalone HTTP server, serving both the API and the Svelte SPA over the network. Typical use case: drop the Docker image on a NAS and access your library from any device on a private VPN (Tailscale recommended).

### Build & run with Docker

The Dockerfile builds the SPA inside the image, so a single command is enough:

```sh
./scripts/docker.sh    # → omo-core:latest
```

A reference `docker-compose.yml` is included. Copy `.env.example` to `.env` next to it, adjust the volume mounts and `OMO_LIBRARY_ROOT` for your library layout, then:

```sh
docker compose up -d --build
```

### Deploying to a remote host

`./scripts/deploy.sh` rsyncs the source to a remote host and runs `docker compose up --build` there — no registry, no `docker save` dance. Defaults to `videodrome:/volume1/docker/omo`; override with `OMO_DEPLOY_HOST` / `OMO_DEPLOY_PATH`. The remote `.env` is never overwritten, so the auth token (if any) survives redeploys.

### Environment variables

| Var | Purpose |
|-----|---------|
| `HOST` | Bind address (default `127.0.0.1`; set `0.0.0.0` for remote use) |
| `PORT` | TCP port (default `3210`) |
| `OMO_AUTH_TOKEN` | If set (and non-empty), gates `/api/*` behind a bearer token. Leave unset behind a private VPN like Tailscale where mesh membership is the access control; set it for any deployment reachable from the public internet |
| `OMO_DB_PATH` | SQLite path (default `~/.local/share/omo-reader/omo-reader.db`) |
| `OMO_CACHE_PATH` | Thumbnail cache directory (default `~/.cache/omo-reader`) |
| `OMO_LIBRARY_ROOT` | Optional base dir; when set, Local Share paths are entered relative to it (e.g. `Western` instead of `/comics/Western`) |

### Connecting clients

The Electron app, a browser, or a PWA on a phone all work the same way:

1. Open `http://<host>:3210/` in the GUI/browser.
2. If `OMO_AUTH_TOKEN` is set on the server, a login screen appears asking for the token; paste it once per device. If the token is unset (recommended for tailnet-only deployments), the app loads immediately.

For Electron specifically: Settings → Server Connection lets you point a locally-installed app at a remote server URL. Browsers always use the host they were loaded from.

### Refresh Metadata

After adding a Local Share or SMB connection, the server walks every chapter in the background to parse archives, generate cover thumbnails, and populate the on-disk caches (`archive_cache` table + WebP thumbnail directory). Subsequent browsing is instant. Manually re-trigger from Settings → Cache → **Refresh Metadata** if the underlying files change.
