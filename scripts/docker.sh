#!/usr/bin/env bash
# Build the headless omo-core Docker image. Self-contained — the Dockerfile
# builds the SPA inside, so no host pre-build is required.
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-omo-core:latest}"
docker build -t "$TAG" .
