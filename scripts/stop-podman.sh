#!/bin/bash
compose=podman-compose

CURR=$(dirname "${BASH_SOURCE[0]}")

# can optionally be used with docker-compose
#compose=docker-compose

$compose -f $CURR/../docker-compose.yml -f $CURR/../configs/docker-compose.podman.yml down -t 0

