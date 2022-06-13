#!/bin/bash
compose=podman-compose

# can optionally be used with docker-compose
#compose=docker-compose

$compose build backend frontend;
$compose secret rm btrix_shared_job_config.yaml
$compose secret create btrix_shared_job_config.yaml ./configs/config.yaml
REGISTRY="" $compose -f docker-compose.yml -f docker-compose.podman.yml up -d --remove-orphans
