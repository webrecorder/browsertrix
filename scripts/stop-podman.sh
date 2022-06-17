#!/bin/bash

compose=docker-compose

# can optionally be used with podman-compose
#compose=podman-compose

CURR=$(dirname "${BASH_SOURCE[0]}")

export DOCKER_HOST=unix://${XDG_RUNTIME_DIR}/podman/podman.sock

$compose -f $CURR/../docker-compose.yml -f $CURR/../configs/docker-compose.podman.yml down -t 0

