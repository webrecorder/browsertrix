#!/usr/bin/env bash
CURR=$(dirname "${BASH_SOURCE[0]}")

docker build -t ${REGISTRY}webrecorder/browsertrix-emails:latest $CURR/../emails/

if [ -n "$REGISTRY" ]; then
    docker push ${REGISTRY}webrecorder/browsertrix-emails
fi
