#!/bin/bash

# enable to build with local registry
# export REGISTRY=localhost:5000/

CURR=$(dirname "${BASH_SOURCE[0]}")

export BACKEND_TAG=latest
export FRONTEND_TAG=latest

# if using authsign
export AUTHSIGN_PORT=80
export AUTHSIGN_TAG=0.5.0

# enable to change minio data storage location
#export MINIO_DATA_VOLUME=/minio-data

docker swarm init

# without authsign
docker stack deploy -c docker-compose.yml -c $CURR/../configs/docker-compose.swarm.yml btrix

# with authsign
#docker stack deploy -c docker-compose.yml -c $CURR/../configs/docker-compose.swarm.yml -c $CURR/../configs/docker-compose.signing.yml btrix

