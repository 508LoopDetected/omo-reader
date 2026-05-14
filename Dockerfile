# Headless omo-core server image.
# Bundles only @omo/core; the GUI ships separately via Electron.
#
# Build:    docker build -t omo-core .
# Run:      docker run --rm -p 3210:3210 \
#               -e HOST=0.0.0.0 \
#               -e OMO_AUTH_TOKEN=<long-random> \
#               -e OMO_DB_PATH=/data/omo-reader.db \
#               -v /path/to/comics:/comics:ro \
#               -v /path/to/data:/data \
#               omo-core

# ── Stage 1: compile core TS → JS ──
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Native build deps (better-sqlite3, sharp). Prebuilt binaries usually cover this,
# but keep them available as a fallback.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/gui/package.json packages/gui/

# --ignore-scripts skips @omo/gui's electron-builder postinstall (we don't need Electron).
RUN npm ci --ignore-scripts

COPY packages/core/src packages/core/src
COPY packages/core/tsconfig.json packages/core/

RUN npx tsc -p packages/core

# ── Stage 2: lean runtime ──
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Build deps temporarily for native rebuild, removed before final layer.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/gui/package.json packages/gui/

# Prod deps only; --ignore-scripts skips @omo/gui's Electron postinstall.
# Rebuild native modules by name so we don't re-trigger sibling workspace scripts.
RUN npm ci --omit=dev --ignore-scripts \
 && npm rebuild better-sqlite3 sharp \
 && apt-get purge -y --auto-remove python3 make g++ \
 && rm -rf /root/.npm /tmp/*

COPY --from=builder /app/packages/core/dist packages/core/dist

# Pre-built Svelte SPA. The headless server auto-discovers this path via
# resolveGuiDir() fallback #4, so any device on the tailnet can hit
# http://videodrome:3210/ in a browser and use the same app the Electron
# binary ships. Run `npm run build:gui` locally before `docker build`.
COPY packages/core/static/gui packages/core/static/gui

ENV HOST=0.0.0.0 \
    PORT=3210 \
    OMO_DB_PATH=/data/omo-reader.db

EXPOSE 3210

CMD ["node", "packages/core/dist/headless.js"]
