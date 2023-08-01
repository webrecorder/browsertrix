#!/usr/bin/env bash
CURR=$(dirname "${BASH_SOURCE[0]}")

DOCKER_BUILDKIT=1 docker build --build-arg GIT_COMMIT_HASH="$(git rev-parse --short HEAD)" --build-arg GIT_BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)" --build-arg --load -t ${REGISTRY}webrecorder/browsertrix-frontend:latest  $CURR/../frontend/

if [ -n "$REGISTRY" ]; then
    docker push ${REGISTRY}webrecorder/browsertrix-frontend
fi
