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

# Plausible analytics
if [ -z "$ANALYTICS" ]; then
  echo "analytics enabled, injecting script"
  [[ "$ANALYTICS" = "true" ]] && SRC="https://p.webrecorder.net" || SRC="$ANALYTICS"

  # Manually minified/compressed version of scripts/inject-analytics.js
  echo "let a=document.createElement('script');a.src='$SRC/js/script.file-downloads.hash.pageview-props.tagged-events.js',a.defer=!0,a.dataset.domain='browsertrix.com',document.head.appendChild(a);let b=document.createElement('script');b.textContent='window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}',document.head.appendChild(b);" > /usr/share/nginx/html/_plausible.js
else
  echo "analytics disabled, injecting blank script"
  echo "" > /usr/share/nginx/html/_plausible.js
fi

mkdir -p /etc/nginx/resolvers/
echo resolver $(grep -oP '(?<=nameserver\s)[^\s]+' /etc/resolv.conf | awk '{ if ($1 ~ /:/) { printf "[" $1 "] "; } else { printf $1 " "; } }') valid=10s ipv6=off";" > /etc/nginx/resolvers/resolvers.conf

cat /etc/nginx/resolvers/resolvers.conf
