#!/usr/bin/env bash
# Build the Electron desktop app: SPA → main-process bundle → installer artifacts.
# Outputs to packages/gui/dist/ (.pacman, .AppImage, .tar.gz on Linux).
#
# This flips better-sqlite3 to Electron ABI as part of `build:electron`. After
# running this, `dev.sh` will rebuild it back to Node ABI on next run.
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/build.sh
npm run --workspace @omo/gui dist
