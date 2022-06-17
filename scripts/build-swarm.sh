#!/bin/bash

CURR=$(dirname "${BASH_SOURCE[0]}")

set -o allexport
source $CURR/../config.env

if [ -n $REGISTRY ]; then
  echo "using registry $REGISTRY"
  docker run -d -p 5000:5000 --restart=always --name registry registry:2
fi

docker-compose build backend frontend


