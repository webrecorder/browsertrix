#!/bin/bash

# enable to build with local registry
# export REGISTRY=localhost:5000/

CURR=$(dirname "${BASH_SOURCE[0]}")

set -o allexport
source $CURR/../configs/config.env

docker swarm init

if [ -z "$WACZ_SIGN_URL" ]; then
  echo "running w/o authsign"
  docker stack deploy -c docker-compose.yml -c $CURR/../configs/docker-compose.swarm.yml btrix

else
  echo "running with authsign"
  docker stack deploy -c docker-compose.yml -c $CURR/../configs/docker-compose.swarm.yml -c $CURR/../configs/docker-compose.signing.yml btrix

fi

