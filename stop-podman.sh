#!/bin/bash
compose=podman-compose

# can optionally be used with docker-compose
#compose=docker-compose

$compose -f docker-compose.yml -f docker-compose.podman.yml down

