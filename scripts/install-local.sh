#!/usr/bin/env bash
# Build the Electron desktop app and install the resulting .pacman via yay.
# Arch-specific convenience for local dev installs.
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/package.sh
yay -U packages/gui/dist/omogui-*.pacman
