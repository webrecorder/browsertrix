#!/bin/bash
docker-compose build backend frontend;
docker secret rm btrix_shared_job_config.yaml
docker secret create btrix_shared_job_config.yaml ./configs/config.yaml
REGISTRY="" docker-compose -f docker-compose.yml -f docker-compose.podman.yml up -d --remove-orphans
