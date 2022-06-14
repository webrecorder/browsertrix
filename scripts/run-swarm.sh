#!/bin/bash
docker run -d -p 5000:5000 --restart=always --name registry registry:2
export REGISTRY=localhost:5000/
docker-compose build backend frontend

CURR=$(dirname "${BASH_SOURCE[0]}")

# without authsign
docker stack deploy -c docker-compose.yml -c $CURR/../configs/docker-compose.swarm.yml btrix

# with authsign
# set port if proxying to authsign via a different port
AUTHSIGN_PORT=80
#docker stack deploy -c docker-compose.yml -c docker-compose.swarm.yml -c $CURR/../configs/docker-compose.signing.yml btrix
