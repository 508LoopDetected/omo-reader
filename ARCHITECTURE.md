# Architecture

npm workspaces monorepo with two packages:

```
packages/
  core/              @omo/core: shared backend (zero framework imports)
    src/
      core/          Service layer (library, progress, collections, settings, reading, manifest)
      db/            Drizzle ORM + better-sqlite3 (auto-migration; includes archive_cache for parsed .cbz contents)
      sources/       ContentSource implementations (local, mangadex, xkcd, smb, extensions)
                     Plus archive-cache.ts (mtime-keyed parse cache), scan-status.ts
                     (live in-flight tracker for GUI spinners), local/library-root.ts
      extensions/    Mangayomi JS extension runtime
      thumbnails/    WebP thumbnail generation + disk cache + warmer.ts (background pre-warm)
      proxy/         Image proxy with caching
      types/         Shared TypeScript interfaces
      router.ts      HTTP router (API routes + GUI SPA serving + optional bearer-token auth)
      server.ts      Node http server (CORS-enabled, configurable HOST)
      headless.ts    Standalone entrypoint for Docker/systemd deployments
      init.ts        Configurable initialization (DB/cache paths via env, XDG, or explicit;
                     fires background warmer on startup)

  gui/               @omo/gui: Svelte 5 + Vite SPA + Electron desktop wrapper
    src/
      electron/      Electron main process, preload, server entry
      entry.ts       SPA entry point
      App.svelte     Root component
      Layout.svelte  Sidebar navigation + NSFW/theme controls
      pages/         11 page components
      lib/           Custom router, stores, utils
        components/  Titlebar, GearToggle, ManagementPanel, EntitySettings, WorkCard, CoverImage, reader/*
```

## Data flow

```
GUI (Svelte SPA)  >  fetch('/api/...')  >  core HTTP router  >  services  >  sources + DB
```

The GUI talks to `@omo/core` exclusively through the HTTP API. Sources implement the `ContentSource` interface and are resolved dynamically by the source manager.

### Deployment modes

- **Embedded (Electron)**: The Electron main process imports `@omo/core`, calls `initialize()` + `createServer()`, and points the BrowserWindow at the local server. Same code path as the standalone server, just running in-process.
- **Headless (Docker / systemd)**: `headless.ts` is the entrypoint — initializes core and starts the HTTP server. The Dockerfile bundles the pre-built Svelte SPA so any device on the network can hit `http://<host>:3210/` in a browser. Reference `docker-compose.yml` is in the repo root.
  - **Auth is optional.** `OMO_AUTH_TOKEN` middleware gates `/api/*` (`Authorization: Bearer …` or `?token=…` query for `<img>` requests) only when the env var is set and non-empty. The intended deployment is behind a private mesh VPN (Tailscale, WireGuard) where mesh membership is the access control; set the token only for deployments reachable from the public internet.
  - **Login flow.** When auth is enabled and the GUI sees a 401, `App.svelte` renders `LoginPage` instead of the main shell. The token is saved per-browser in localStorage (or per-userData partition in Electron). When auth is disabled, the login page never appears.

## Manifest-driven UI

The app structure is defined by a single manifest (`core/manifest.ts`) that describes navigation, views, controls, settings, and management sections. The GUI consumes this manifest as a pure renderer. Adding a new setting or nav item means updating the manifest, not the frontend.

## Contextual management

Entity management is inline on the pages where it belongs, not centralized in Settings. Each page has a gear icon toggle (`GearToggle.svelte`) that reveals management controls:

- **Library page**: create/edit libraries and collections (`ManagementPanel` filtering manifest sections by ID)
- **LibraryDetail / CollectionDetail**: rename, reader overrides, NSFW toggle, delete (`EntitySettings`)
- **Sources page**: add/remove local paths and SMB shares (`ManagementPanel`)
- **Extensions page**: manage extension repos (`ManagementPanel`)
- **Settings page**: app-wide settings only (NSFW mode, reader defaults, theme) plus cache and danger zone

`ManagementPanel` is self-contained: fetches the manifest, filters to the requested section IDs, manages all CRUD state internally, and dispatches change events for sidebar refresh.

## Local source scanning

Local and SMB sources use recursive group detection to discover titles from directory structures. The rule is simple:

- **Directory has content** (archives or images directly inside) → it's a **title**
- **Directory has only subdirectories** (no content) → it's a **transparent group**, recurse deeper

This handles arbitrarily nested structures automatically (e.g. `Publisher/Imprint/Series/volume.cbz`). There is no configurable browse mode — the heuristic applies universally.

### Skeletal scan + lazy detail

`scanner.getChapters()` returns chapters by filename only — no archive reads at scan time. Per-chapter pageCount, ComicInfo metadata, and internal-chapter splits come from `getChapterDetail(sourceId, chapterId)`, which parses one archive on demand and caches the result in the `archive_cache` SQLite table keyed by file mtime.

This makes opening any work near-instant (even a 60-issue series) and pays the parse cost only when the user clicks into a specific volume. The `VolumeDetail.svelte` panel fetches detail on mount with a spinner. The `archive-cache` helper deduplicates concurrent reads so the warmer and a user click on the same archive don't double-parse.

### Background "Refresh Metadata" warmer

`thumbnails/warmer.ts` walks every library item and, per chapter, calls `getChapterDetail` (populating `archive_cache`) plus `getChapterThumbnail` (populating the WebP cache). Triggered automatically on `addToLibrary` / `bulkAddFromSource` / server startup, and manually via `POST /api/cache/warm` (Settings → "Refresh Metadata"). Throttled to a configurable concurrency; skips already-cached items so re-runs are cheap.

`sources/scan-status.ts` exposes a live set of in-flight `(sourceId, chapterId)` and `(sourceId, workId)` pairs. `GET /api/cache/scan-status` returns this set, and the GUI polls it to render per-card scanning spinners (sidebar Library icon, work cards, chapter grid cards).

### Library-root resolution

`sources/local/library-root.ts` provides `resolveLibraryPath(input)` — when `OMO_LIBRARY_ROOT` is set (typical for headless container deployments), Local Share paths stored as relative are joined to the root. Absolute paths bypass this. Lets the GUI prompt for `Western` instead of `/comics/Western` when running in Docker.

## Settings cascade

Reader direction, cover page offset, and cover art mode resolve through a cascade: per-title setting > per-collection > per-library > global default. The resolution happens in `core/reader-settings-service.ts`.

## Key conventions

- **Generic term is "work"**: `WorkEntry`, `workId`, `ContentSource`, `WorkCard`. "Manga" only appears in MangaDex API internals, Mangayomi extension types (`RawMManga`), and `LibraryType` enum values (`'manga' | 'western' | 'webcomic'`).
- **Plain Svelte 5**, not SvelteKit. Custom hash router at `gui/src/lib/router.ts`.
- **DB**: `better-sqlite3` via Drizzle ORM. Synchronous queries.
- **Sharp is optional**: lazy dynamic import with fallback to full-size images.
- **DB path**: `OMO_DB_PATH` env var, or XDG default `~/.local/share/omo-reader/omo-reader.db`.
- **Optional bearer auth**: `/api/*` gated by `OMO_AUTH_TOKEN` only when the env var is set. GUI's `apiUrl()` appends `?token=…` to `/api/*` paths so `<img src>` requests work without per-element headers when auth is on.

## Reader

`packages/gui/src/lib/components/reader/` — Svelte components used by the GUI. Supports spread, single page, and vertical scroll modes with RTL/LTR and cover page offset.

## Stack

- **Runtime**: Node.js
- **Frontend**: Svelte 5, Vite, Bulma CSS, custom hash router
- **Database**: better-sqlite3 via Drizzle ORM
- **Desktop**: Electron (frameless window, custom titlebar)
- **Extensions**: Mangayomi JS ecosystem
- **Build**: esbuild (Electron main process), Vite (frontend SPA)
- **CI/CD**: GitHub Actions, triggered on `v*.*.*` tags

## App (technical details)

**omogui**: Electron app. The main process initializes `@omo/core`, starts a Node HTTP server on port 3210, and creates a frameless `BrowserWindow` pointed at it. The Svelte 5 frontend is built as a static SPA and bundled with the app. The preload script exposes window control IPC (`minimize`, `toggleMaximize`, `close`, `isMaximized`, `onMaximizedChange`) via `contextBridge`. The frontend `Titlebar.svelte` component renders a floating pill panel with minimize, maximize/restore, and close buttons, using `-webkit-app-region: drag` for window dragging. The esbuild script (`scripts/build-electron.mjs`) bundles the main process and server entry as CJS, externalizing `electron` and `better-sqlite3` (native module).
