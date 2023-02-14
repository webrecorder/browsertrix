#!/bin/bash
CURR=$(dirname "${BASH_SOURCE[0]}")

docker build --build-arg GIT_COMMIT_HASH="$(git rev-parse --short HEAD)" --build-arg GIT_BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)" --build-arg --load -t ${REGISTRY}webrecorder/browsertrix-frontend:latest  $CURR/../frontend/

if [ -n "$REGISTRY" ]; then
    TAG=`docker images | grep ${REGISTRY}webrecorder/browsertrix-frontend | awk '{ print $3 }'`
    docker tag $TAG ${REGISTRY}webrecorder/browsertrix-frontend:latest
    docker push ${REGISTRY}webrecorder/browsertrix-frontend
fi
