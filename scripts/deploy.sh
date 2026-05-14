#!/usr/bin/env bash
# Deploy the headless server to a remote host via rsync + remote `docker compose
# up --build`. No registry, no docker save/load — just source code over SSH and
# the remote rebuilds. Portable to any SSH-reachable Docker host.
#
# Override with env vars:
#   OMO_DEPLOY_HOST=videodrome
#   OMO_DEPLOY_PATH=/volume1/docker/omo
#
# The remote `.env` lives at "$OMO_DEPLOY_PATH/.env" and is NOT overwritten by
# rsync — secrets stay on the host.
set -euo pipefail
cd "$(dirname "$0")/.."

REMOTE_HOST="${OMO_DEPLOY_HOST:-videodrome}"
REMOTE_PATH="${OMO_DEPLOY_PATH:-/volume1/docker/omo}"

echo "→ Syncing source to $REMOTE_HOST:$REMOTE_PATH"
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
	--exclude=packages/gui/dist-electron \
	--exclude=.claude \
	./ "$REMOTE_HOST:$REMOTE_PATH/"

echo "→ Building image + restarting compose on $REMOTE_HOST"
ssh "$REMOTE_HOST" "cd $REMOTE_PATH && docker compose up -d --build"

echo "✓ Deployed. Test: curl http://$REMOTE_HOST:3210/"
