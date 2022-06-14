#!/bin/bash
docker run -d -p 5000:5000 --restart=always --name registry registry:2
export REGISTRY=localhost:5000/
docker-compose build backend frontend


