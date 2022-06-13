#!/bin/bash
docker-compose -f docker-compose.yml -f docker-compose.podman.yml kill; docker-compose -f docker-compose.yml -f docker-compose.podman.yml rm -f;

