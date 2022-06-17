#!/bin/bash

compose=docker-compose
# can optionally be used with podman-compose
#compose=podman-compose

CURR=$(dirname "${BASH_SOURCE[0]}")

set -o allexport
source $CURR/../configs/config.env

export SOCKET_SRC=${XDG_RUNTIME_DIR}/podman/podman.sock
export SOCKET_DEST=/run/user/0/podman/podman.sock
export DOCKER_HOST=unix://${XDG_RUNTIME_DIR}/podman/podman.sock

echo $SOCKET_SRC:$SOCKET_DEST

if [ -z "$WACZ_SIGN_URL" ]; then
  echo "running w/o authsign"
  $compose -f $CURR/../docker-compose.yml -f $CURR/../configs/docker-compose.podman.yml up -d

else
  echo "running with authsign"
  $compose -f $CURR/../docker-compose.yml -f $CURR/../configs/docker-compose.podman.yml -f $CURR/../configs/docker-compose.signing.yml up -d

fi

