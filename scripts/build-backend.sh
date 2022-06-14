#!/bin/bash
CURR=$(dirname "${BASH_SOURCE[0]}")

docker buildx build --platform linux/amd64 --push -t ${REGISTRY}webrecorder/browsertrix-backend $CURR/../backend/

