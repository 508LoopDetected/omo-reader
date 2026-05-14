#!/usr/bin/env bash
# Deploy the headless server to a remote host via rsync + remote `docker compose
# up --build`. No registry, no docker save/load — just source code over SSH and
# the remote rebuilds. Portable to any SSH-reachable Docker host.
#
# Configuration via env vars (settable in .env at the repo root, or exported):
#   OMO_DEPLOY_HOST  SSH target (e.g. my-nas)
#   OMO_DEPLOY_PATH  Path on the remote where the repo + compose live
#
# The remote `.env` at $OMO_DEPLOY_PATH/.env is NOT overwritten by rsync —
# secrets and host-specific paths stay on the host they belong to.
set -euo pipefail
cd "$(dirname "$0")/.."

# Load local .env if present (host/path/token live here).
if [ -f .env ]; then
	set -a
	. ./.env
	set +a
fi

: "${OMO_DEPLOY_HOST:?Set OMO_DEPLOY_HOST in .env or export it (e.g. my-nas)}"
: "${OMO_DEPLOY_PATH:?Set OMO_DEPLOY_PATH in .env or export it (e.g. /srv/omo)}"

echo "→ Syncing source to $OMO_DEPLOY_HOST:$OMO_DEPLOY_PATH"
rsync -avz --delete \
	--exclude=.git \
	--exclude=node_modules \
	--exclude=.env \
	--exclude=data \
	--exclude='*.db' \
	--exclude='*.db-shm' \
	--exclude='*.db-wal' \
	--exclude=packages/core/dist \
	--exclude=packages/core/static/gui \
	--exclude=packages/gui/build \
	--exclude=packages/gui/dist \
	--exclude=.claude \
	./ "$OMO_DEPLOY_HOST:$OMO_DEPLOY_PATH/"

echo "→ Building image + restarting compose on $OMO_DEPLOY_HOST"
ssh "$OMO_DEPLOY_HOST" "cd $OMO_DEPLOY_PATH && docker compose up -d --build"

echo "✓ Deployed. Test: curl http://$OMO_DEPLOY_HOST:3210/"
