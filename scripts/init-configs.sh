#!/bin/bash

set -e 0

# copy shared env config (if needed)
cp -n ./configs/config.sample.env ./configs/config.env

# copy config.yaml job config (if needed)
cp -n ./configs/config.sample.yaml ./configs/config.yaml

# copy signing (if needed)
cp -n ./configs/signing.sample.yaml ./configs/signing.yaml
