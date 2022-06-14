#!/bin/bash
compose=podman-compose

# can optionally be used with docker-compose
#compose=docker-compose
CURR=$(dirname "${BASH_SOURCE[0]}")

podman secret rm btrix_shared_job_config.yaml
podman secret create btrix_shared_job_config.yaml $CURR/../configs/config.yaml
REGISTRY="" $compose -f $CURR/../docker-compose.yml -f  $CURR/../configs/docker-compose.podman.yml up -d --remove-orphans
