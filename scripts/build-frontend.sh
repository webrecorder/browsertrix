#!/usr/bin/env bash
CURR=$(dirname "${BASH_SOURCE[0]}")

export GIT_COMMIT_HASH="$(git rev-parse --short HEAD)"
export GIT_BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)"
export RWP_BASE_URL="https://cdn.jsdelivr.net/npm/replaywebpage/"
export VERSION=`cat version.txt`

DOCKER_BUILDKIT=1 docker build --progress=plain --no-cache \
    --build-arg GIT_COMMIT_HASH \
    --build-arg GIT_BRANCH_NAME \
    --build-arg --load \
    --file frontend/builder.Dockerfile \
    -t user/browsertrix-frontend-builder:test $CURR/../frontend/

docker cp $(docker create --name bc-frontend-builder-temp user/browsertrix-frontend-builder:test):/app/dist ./frontend/.dist && docker rm bc-frontend-builder-temp

DOCKER_BUILDKIT=1 docker build --progress=plain --no-cache \
    --build-arg GIT_COMMIT_HASH \
    --build-arg GIT_BRANCH_NAME \
    --build-arg --load \
    -t ${REGISTRY}webrecorder/browsertrix-frontend:latest $CURR/../frontend/

if [ -n "$REGISTRY" ]; then
    docker push ${REGISTRY}webrecorder/browsertrix-frontend
fi
