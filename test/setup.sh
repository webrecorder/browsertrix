#!/bin/sh

# to be run from repo root as cwd

cp ./configs/config.sample.env ./configs/config.env
cp ./configs/storages.sample.yaml ./configs/storages.yaml

docker swarm init

#docker service create --name registry --publish published=5000,target=5000 registry:2

export REGISTRY=localhost:5000/

#docker-compose build

docker stack deploy -c docker-compose.yml btrix --resolve-image never

sleep 20

docker stack ps btrix --no-trunc


