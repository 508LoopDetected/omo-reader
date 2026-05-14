#!/usr/bin/env bash
# Run the dev server: Vite + @omo/core subprocess on :3210, with hot reload.
#
# `npm rebuild better-sqlite3` is a no-op if the prebuilt Node-ABI binary is
# already in place. It only takes time after a desktop build (`package.sh`),
# which flips the binary to Electron ABI. Cheap insurance, slow rebuild only
# happens when needed.
set -euo pipefail
cd "$(dirname "$0")/.."

npm install --silent
npm rebuild better-sqlite3 --quiet
npm run dev
