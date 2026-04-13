#!/usr/bin/env bash
set -euo pipefail

npm run build:gui && npm run --workspace @omo/gui dist && yay -U packages/gui/dist/omogui-*.pacman
