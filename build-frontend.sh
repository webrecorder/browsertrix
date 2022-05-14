#!/bin/bash
docker buildx build --no-cache --progress=plain --build-arg GIT_COMMIT_HASH="$(git rev-parse --short HEAD)" --build-arg GIT_BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)" --build-arg RWP_BASE_URL="https://replayweb.page/" --platform linux/amd64 --push -t ${REGISTRY}webrecorder/browsertrix-frontend ./frontend/
