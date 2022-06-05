#!/bin/sh

set -e

# to be run from repo root as cwd
cp ./configs/config.sample.env ./configs/config.env
cp ./configs/storages.sample.yaml ./configs/storages.yaml

docker swarm init

#docker service create --name registry --publish published=5000,target=5000 registry:2

export REGISTRY=localhost:5000/

#docker-compose build

docker stack deploy -c docker-compose.yml btrix --resolve-image changed

count=0

while [[ "$(curl -s -o /dev/null -w ''%{http_code}'' http://localhost:9871)" != "200" ]];
do
  echo "waiting for startup..."
  sleep 5
  count=$((count+1))
  if [ $count -gt 25 ]; then
    echo "swarm frontend startup failed, frontend & backend logs below:"
    echo ""
    echo "frontend"
    echo "--------"
    docker service logs btrix_frontend 2>&1 | cat
    echo "backend"
    echo "--------"
    docker service logs btrix_backend 2>&1 | cat
    exit 1
  fi
done



