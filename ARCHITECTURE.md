# Architecture

npm workspaces monorepo with three packages:

```
packages/
  core/              @omo/core: shared backend (zero framework imports)
    src/
      core/          Service layer (library, progress, collections, settings, reading, manifest)
      db/            Drizzle ORM + better-sqlite3 (13 tables, auto-migration)
      sources/       ContentSource implementations (local, mangadex, xkcd, smb, extensions)
      extensions/    Mangayomi JS extension runtime
      thumbnails/    WebP thumbnail generation + disk cache
      proxy/         Image proxy with caching
      types/         Shared TypeScript interfaces
      router.ts      HTTP router (API routes + reader SPA + GUI SPA serving)
      server.ts      Node http server
      init.ts        Configurable initialization (DB/cache paths via env, XDG, or explicit)
    reader/          Standalone reader SPA (Svelte 5 + Vite, served at /reader)

  gui/               @omo/gui: Svelte 5 + Vite SPA + Electron desktop wrapper
    src/
      electron/      Electron main process, preload, server entry
      entry.ts       SPA entry point
      App.svelte     Root component
      Layout.svelte  Sidebar navigation + NSFW/theme controls
      pages/         11 page components
      lib/           Custom router, stores, utils
        components/  Titlebar, GearToggle, ManagementPanel, EntitySettings, WorkCard, CoverImage, reader/*

  tui/               @omo/tui: terminal interface
    src/
      main.ts        Entry point (init core, start server, run TUI)
      app.ts         Elm-style app model (tabs, columns, overlays, NSFW toggle)
      tea.ts         Custom bubbletea-style runtime (Program/Model/Msg/Dispatch)
      views/         8 view modules (library, sources, browse, search, extensions, settings, detail, overlays)
      manifest.ts    Manifest types + helpers
```

## Data flow

```
GUI (Svelte SPA)  >  fetch('/api/...')  >  core HTTP router  >  services  >  sources + DB
TUI (direct)      >  import @omo/core   >  services           >  sources + DB
```

Both apps share `@omo/core` for all backend logic. Sources implement the `ContentSource` interface and are resolved dynamically by the source manager.

## Manifest-driven UI

The app structure is defined by a single manifest (`core/manifest.ts`) that describes navigation, views, controls, settings, and management sections. Both GUI and TUI consume this manifest as pure renderers. Adding a new setting or nav item means updating the manifest, not each frontend.

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

## Settings cascade

Reader direction, cover page offset, and cover art mode resolve through a cascade: per-title setting > per-collection > per-library > global default. The resolution happens in `core/reader-settings-service.ts`.

## Key conventions

- **Generic term is "work"**: `WorkEntry`, `workId`, `ContentSource`, `WorkCard`. "Manga" only appears in MangaDex API internals, Mangayomi extension types (`RawMManga`), and `LibraryType` enum values (`'manga' | 'western' | 'webcomic'`).
- **Plain Svelte 5**, not SvelteKit. Custom hash router at `gui/src/lib/router.ts`.
- **DB**: `better-sqlite3` via Drizzle ORM. Synchronous queries.
- **Sharp is optional**: lazy dynamic import with fallback to full-size images.
- **DB path**: `OMO_DB_PATH` env var, or XDG default `~/.local/share/omo-reader/omo-reader.db`.

## Reader

The reader exists in two places (this is tech debt, see TODO.md):

1. **GUI reader**: `packages/gui/src/lib/components/reader/` (Svelte components used by the GUI app)
2. **Standalone reader SPA**: `packages/core/reader/` (separate Svelte app served at `/reader`, used by the TUI via browser)

Both support spread, single page, and vertical scroll modes with RTL/LTR and cover page offset.

## Stack

- **Runtime**: Node.js
- **Frontend**: Svelte 5, Vite, Bulma CSS, custom hash router
- **Database**: better-sqlite3 via Drizzle ORM
- **Desktop**: Electron (frameless window, custom titlebar)
- **TUI**: custom Elm-architecture framework (bubbletea-style), chalk, ANSI rendering
- **Extensions**: Mangayomi JS ecosystem
- **Build**: esbuild (Electron main process), Vite (frontend SPAs)
- **CI/CD**: GitHub Actions, triggered on `v*.*.*` tags

## Apps (technical details)

**omogui**: Electron app. The main process initializes `@omo/core`, starts a Node HTTP server on port 3210, and creates a frameless `BrowserWindow` pointed at it. The Svelte 5 frontend is built as a static SPA and bundled with the app. The preload script exposes window control IPC (`minimize`, `toggleMaximize`, `close`, `isMaximized`, `onMaximizedChange`) via `contextBridge`. The frontend `Titlebar.svelte` component renders a floating pill panel with minimize, maximize/restore, and close buttons, using `-webkit-app-region: drag` for window dragging. The esbuild script (`scripts/build-electron.mjs`) bundles the main process and server entry as CJS, externalizing `electron` and `better-sqlite3` (native module).

**omotui**: initializes `@omo/core` and calls service functions directly (no HTTP roundtrip for data). Renders panels, lists, and overlays with ANSI colors and Nerd Font icons. The reader opens in the user's default browser, pointed at the standalone reader SPA served by the core HTTP server.
