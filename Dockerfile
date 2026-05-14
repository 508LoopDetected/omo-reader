# omo-core server image.
# Bundles @omo/core + the Svelte SPA so any device on the network can hit
# http://<host>:3210/ in a browser (or install as a PWA).
#
# Build:    docker build -t omo-core .
# Run:      docker compose up -d   (see docker-compose.yml)

# ── Stage 1: compile core TS + build Svelte SPA ──
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Native build deps for better-sqlite3 / sharp (prebuilt binaries usually cover
# this, but keep them available as a fallback).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/gui/package.json packages/gui/

# --ignore-scripts skips workspace install hooks; we rebuild natives by name
# in the runtime stage below.
RUN npm ci --ignore-scripts

COPY packages/core packages/core
COPY packages/gui packages/gui

# Compile core → packages/core/dist, build SPA → packages/gui/build.
RUN npx tsc -p packages/core \
 && npm run --workspace @omo/gui build

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

# Prod deps only. Rebuild native modules by name so we don't re-trigger sibling
# workspace scripts.
RUN npm ci --omit=dev --ignore-scripts \
 && npm rebuild better-sqlite3 sharp \
 && apt-get purge -y --auto-remove python3 make g++ \
 && rm -rf /root/.npm /tmp/*

COPY --from=builder /app/packages/core/dist packages/core/dist

# SPA lands where resolveGuiDir() fallback #4 expects it
# (packages/core/static/gui, relative to the compiled router.js).
COPY --from=builder /app/packages/gui/build packages/core/static/gui

ENV HOST=0.0.0.0 \
    PORT=3210 \
    OMO_DB_PATH=/data/omo-reader.db

EXPOSE 3210

CMD ["node", "packages/core/dist/headless.js"]
