#!/usr/bin/env bash

# remove old config
rm /etc/nginx/conf.d/default.conf

if [ -z "$LOCAL_STORAGE_HOST" ]; then
  echo "no local storage, clearing out storage route"
  echo "" >/etc/nginx/includes/storage.conf
else
  LOCAL_ACCESS_PATH=$(printf '%s\n' "$LOCAL_ACCESS_PATH" | sed -e 's/[\/&]/\\&/g')
  echo "local storage: replacing \$LOCAL_STORAGE_HOST with \"$LOCAL_STORAGE_HOST\", \$LOCAL_BUCKET with \"$LOCAL_BUCKET\", \$LOCAL_ACCESS_PATH with \"$LOCAL_ACCESS_PATH\""
  sed -i "s/\$LOCAL_ACCESS_PATH/$LOCAL_ACCESS_PATH/g" /etc/nginx/includes/storage.conf
  sed -i "s/\$LOCAL_STORAGE_HOST/$LOCAL_STORAGE_HOST/g" /etc/nginx/includes/storage.conf
  sed -i "s/\$LOCAL_BUCKET/$LOCAL_BUCKET/g" /etc/nginx/includes/storage.conf
fi

# Add analytics script, if provided
if [ -z "$INJECT_EXTRA" ]; then
  echo "analytics disabled, injecting blank script"
  echo "" >/usr/share/nginx/html/extra.js
else
  echo "analytics enabled, injecting script"
  echo "$INJECT_EXTRA" >/usr/share/nginx/html/extra.js
fi

mkdir -p /etc/nginx/resolvers/
echo resolver $(grep -oP '(?<=nameserver\s)[^\s]+' /etc/resolv.conf | awk '{ if ($1 ~ /:/) { printf "[" $1 "] "; } else { printf $1 " "; } }') valid=10s ipv6=off";" >/etc/nginx/resolvers/resolvers.conf

cat /etc/nginx/resolvers/resolvers.conf
