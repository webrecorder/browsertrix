#!/bin/bash
CURR=$(dirname "${BASH_SOURCE[0]}")

docker build -t ${REGISTRY}webrecorder/browsertrix-backend:latest $CURR/../backend/

if [ -n "$REGISTRY" ]; then
    TAG=`docker images | grep ${REGISTRY}webrecorder/browsertrix-backend | awk '{ print $3 }'`
    docker tag $TAG ${REGISTRY}webrecorder/browsertrix-backend:latest
    docker push ${REGISTRY}webrecorder/browsertrix-backend
fi
