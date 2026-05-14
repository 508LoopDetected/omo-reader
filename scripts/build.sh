#!/usr/bin/env bash
# Build the Svelte SPA → packages/gui/build/.
# Electron reads it from there; the Docker image builds its own copy internally.
set -euo pipefail
cd "$(dirname "$0")/.."

npm install --silent
npm run build
