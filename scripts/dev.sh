#!/usr/bin/env bash
# Run the dev server: Vite + @omo/core subprocess on :3210, with hot reload.
# better-sqlite3 stays on its Node-ABI prebuilt binary — no rebuild dance.
set -euo pipefail
cd "$(dirname "$0")/.."

npm install --silent
npm run dev
