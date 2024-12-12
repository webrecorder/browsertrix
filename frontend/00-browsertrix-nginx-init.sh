#!/usr/bin/env bash

# remove old config
rm /etc/nginx/conf.d/default.conf

if [ -z "$LOCAL_MINIO_HOST" ]; then
  echo "no local minio, clearing out minio route"
  echo "" > /etc/nginx/includes/minio.conf
else
  echo "local minio: replacing \$LOCAL_MINIO_HOST with \"$LOCAL_MINIO_HOST\", \$LOCAL_BUCKET with \"$LOCAL_BUCKET\""
  sed -i "s/\$LOCAL_MINIO_HOST/$LOCAL_MINIO_HOST/g" /etc/nginx/includes/minio.conf
  sed -i "s/\$LOCAL_BUCKET/$LOCAL_BUCKET/g" /etc/nginx/includes/minio.conf
fi

# Add analytics script, if provided
if [ -z "$INJECT_ANALYTICS" ]; then
  echo "analytics disabled, injecting blank script"
  echo "" > /usr/share/nginx/html/extra.js
else
  echo "analytics enabled, injecting script"
  echo "$INJECT_ANALYTICS" > /usr/share/nginx/html/extra.js
fi

mkdir -p /etc/nginx/resolvers/
echo resolver $(grep -oP '(?<=nameserver\s)[^\s]+' /etc/resolv.conf | awk '{ if ($1 ~ /:/) { printf "[" $1 "] "; } else { printf $1 " "; } }') valid=10s ipv6=off";" > /etc/nginx/resolvers/resolvers.conf

cat /etc/nginx/resolvers/resolvers.conf
