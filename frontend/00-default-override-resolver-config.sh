#!/bin/bash

# remove old config
rm /etc/nginx/conf.d/default.conf

if [ "$NO_MINIO_ROUTE" == "1" ]; then
  echo "clearning out minio route"
  echo "" > /etc/nginx/includes/minio.conf
fi

mkdir -p /etc/nginx/resolvers/
echo resolver $(awk 'BEGIN{ORS=" "} $1=="nameserver" {print $2}' /etc/resolv.conf) valid=30s ";" > /etc/nginx/resolvers/resolvers.conf

cat /etc/nginx/resolvers/resolvers.conf
