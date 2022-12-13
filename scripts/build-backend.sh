#!/bin/bash
CURR=$(dirname "${BASH_SOURCE[0]}")

docker build -t ${REGISTRY}webrecorder/browsertrix-backend $CURR/../backend/

