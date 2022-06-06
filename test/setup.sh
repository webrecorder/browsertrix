#!/bin/bash

set -e


#docker service create --name registry --publish published=5000,target=5000 registry:2

export REGISTRY=localhost:5000/
export FRONTEND_HOST=http://127.0.0.1:9871

docker swarm init

docker stack deploy -c docker-compose.yml btrix --resolve-image changed

count=0
sleepfor=5

until $(curl -m 3 --output /dev/null --head --fail $FRONTEND_HOST/); do
  echo "waiting for frontend startup... (has waited for $count seconds)"
  sleep $sleepfor
  count=$((count+$sleepfor))
  if [ $count -gt 60 ]; then
    echo "swarm frontend startup failed, frontend & backend logs below:"
    echo ""
    echo "ps"
    echo "--------"
    docker stack ps btrix --no-trunc
    echo "frontend"
    echo "--------"
    docker service logs btrix_frontend 2>&1 | cat
    echo "backend"
    echo "--------"
    docker service logs btrix_backend 2>&1 | cat
  fi
done


until $(curl -m 3 --output /dev/null --fail $FRONTEND_HOST/api/settings); do
  echo "waiting for backend api startup... (has waited for $count seconds)"
  sleep $sleepfor
  count=$((count+$sleepfor))
  if [ $count -gt 60 ]; then
    echo "swarm frontend startup failed, frontend & backend logs below:"
    echo ""
    echo "ps"
    echo "--------"
    docker stack ps btrix --no-trunc
    echo "frontend"
    echo "--------"
    docker service logs btrix_frontend 2>&1 | cat
    echo "backend"
    echo "--------"
    docker service logs btrix_backend 2>&1 | cat
  fi
done


