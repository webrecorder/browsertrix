#!/usr/bin/env bash
CURR=$(dirname "${BASH_SOURCE[0]}")

docker build -t ${REGISTRY}webrecorder/browsertrix-backend:latest $CURR/../backend/

if [ -n "$REGISTRY" ]; then
    docker push ${REGISTRY}webrecorder/browsertrix-backend
fi
