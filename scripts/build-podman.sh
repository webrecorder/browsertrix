#!/bin/bash
compose=podman-compose

# can optionally be used with docker-compose
#compose=docker-compose
CURR=$(dirname "${BASH_SOURCE[0]}")

# get current podman version
version=$(podman --version | grep -P '([\d]\.[\d])' -o)

# build
$compose build --build-arg PODMAN_VERSION=$version backend frontend

