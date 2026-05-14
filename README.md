# omo

Comic and manga reader. Ships as a self-hosted server with a Svelte/PWA frontend — drop the Docker image on a NAS, open it in any browser on your network, install it as a PWA on phone/tablet/desktop.

## What it does

- **Sources**: local directories (folders, CBZ, CBR), SMB/Samba shares, MangaDex, xkcd, Mangayomi JS extensions; recursive group detection automatically handles nested directory structures at any depth
- **Library**: organize into typed libraries (manga, western, webcomic) and cross-library collections; search, sort, per-chapter progress tracking; bulk-add from local/SMB sources; inline management via contextual gear toggles on each page
- **Reader**: two-page spread, single page, vertical scroll; RTL/LTR, cover page offset; keyboard/mouse nav; auto-saves progress per chapter
- **Settings cascade**: reader direction, cover page offset, and cover art mode are configurable per title, per collection, per library, or globally, with each level inheriting from the one above
- **NSFW filtering**: flag individual titles or entire libraries as NSFW; a global SFW/All/NSFW filter controls visibility across the sidebar, home page, and all title queries
- **Extensions**: Mangayomi-compatible JS extensions from configurable repos
- **Thumbnails**: cover images resized to WebP and cached locally (optional `sharp`, falls back to full-size)
- **PWA**: installable from any modern browser — home-screen icon, standalone window, offline shell

## Running it

The server (`@omo/core`) is the whole app. It runs an HTTP server on `:3210` that serves both the API and the Svelte SPA. Any device on the network points its browser at it; install it as a PWA if you want an app-shaped window.

### With Docker (typical)

```sh
./scripts/docker.sh           # build omo-core:latest (Dockerfile builds the SPA inside)
docker compose up -d --build  # bring it up using docker-compose.yml
```

`docker-compose.yml` is a reference deployment. Copy `.env.example` → `.env`, adjust the volume mounts and `OMO_LIBRARY_ROOT` for your library layout, then `docker compose up -d --build`.

### Deploying to a remote host

`./scripts/deploy.sh` rsyncs the source to a remote SSH host and runs `docker compose up --build` there — no registry, no `docker save` dance. Configure via `OMO_DEPLOY_HOST` / `OMO_DEPLOY_PATH` in `.env` (see `.env.example`). The remote `.env` is never overwritten, so the auth token + host paths survive redeploys.

Tag-pushed releases also publish a multi-arch image to `ghcr.io/<owner>/omo-core` (see `.github/workflows/release.yml`).

### Installing as a PWA

Open `http://<host>:3210/` in Chrome/Edge/Safari. On desktop, click the install icon in the URL bar. On Android, "Add to home screen." On iOS Safari, share sheet → "Add to home screen." The app gets its own window with no browser chrome.

## Development

```sh
./scripts/dev.sh                     # vite + core subprocess, HMR
npx svelte-check --threshold error   # type check
```

| Script | Stage |
|--------|-------|
| `dev.sh` | vite dev + core subprocess, HMR |
| `docker.sh` | Build `omo-core:latest` locally |
| `deploy.sh` | rsync to a remote host, `docker compose up --build` there |

### Other dependencies

- `smbclient` (from `samba-client` or equivalent) for SMB share support
- `sharp` (optional) for thumbnail generation; falls back to full-size images if unavailable

### Cutting a release

Push a SemVer tag. The workflow builds the Docker image and pushes it to `ghcr.io/<owner>/omo-core` tagged with the version, `<major>.<minor>`, and `latest`.

```sh
npm version patch   # or minor / major — bumps version + tags
git push --follow-tags
```

## Data

| Path | Purpose |
|------|---------|
| `/data/omo-reader.db` (in container) | SQLite database (library, progress, settings, parsed-archive cache) |
| `/data/cache` (in container) | WebP thumbnail cache (safe to delete) |

Overridable via `OMO_DB_PATH`, `OMO_CACHE_PATH`, `OMO_GUI_DIR`, `OMO_LIBRARY_ROOT` environment variables.

## Environment variables

| Var | Purpose |
|-----|---------|
| `HOST` | Bind address (default `127.0.0.1`; set `0.0.0.0` for remote use) |
| `PORT` | TCP port (default `3210`) |
| `OMO_AUTH_TOKEN` | If set (and non-empty), gates `/api/*` behind a bearer token. Leave unset behind a private VPN like Tailscale where mesh membership is the access control; set it for any deployment reachable from the public internet |
| `OMO_DB_PATH` | SQLite path (default `~/.local/share/omo-reader/omo-reader.db`) |
| `OMO_CACHE_PATH` | Thumbnail cache directory (default `~/.cache/omo-reader`) |
| `OMO_LIBRARY_ROOT` | Optional base dir; when set, Local Share paths are entered relative to it (e.g. `Western` instead of `/comics/Western`) |

## Refresh Metadata

After adding a Local Share or SMB connection, the server walks every chapter in the background to parse archives, generate cover thumbnails, and populate the on-disk caches (`archive_cache` table + WebP thumbnail directory). Subsequent browsing is instant. Manually re-trigger from Settings → Cache → **Refresh Metadata** if the underlying files change.
