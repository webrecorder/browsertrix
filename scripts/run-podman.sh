#!/bin/bash

compose=docker-compose
# can optionally be used with podman-compose
compose=podman-compose

CURR=$(dirname "${BASH_SOURCE[0]}")

source $CURR/../configs/config.env

SOCKET_SRC=${XDG_RUNTIME_DIR-/run}/podman/podman.sock
SOCKET_DEST=/run/user/0/podman/podman.sock

if [ -z "$WACZ_SIGN_URL" ]; then
  echo "running w/o authsign"
  docker stack deploy -c docker-compose.yml -c $CURR/../configs/docker-compose.podman.yml btrix

else
  echo "running with authsign"
  docker stack deploy -c docker-compose.yml -c $CURR/../configs/docker-compose.podman.yml -c $CURR/../configs/docker-compose.signing.yml btrix

fi

