#!/usr/bin/env bash
CURR=$(dirname "${BASH_SOURCE[0]}")

TARGET=$CURR/docs/api/
mkdir $TARGET
curl "$DOCS_SOURCE_URL/api/openapi.json" > $TARGET/openapi.json
curl "$DOCS_SOURCE_URL/api/redoc" | sed 's/docs\/api-assets/api-assets/g' > $TARGET/index.html
curl "$DOCS_SOURCE_URL/docs-logo.svg" > $TARGET/../docs-logo.svg

if [ -n $ENABLE_ANALYTICS ]; then
  SCRIPT_1='    <script defer data-domain=\"docs.browsertrix.com\" src=\"https://p.webrecorder.net/js/script.outbound-links.js\"></script>'
  SCRIPT_2='    <script>window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments) }</script>'
  awk "1;/<head>/{ print \"$SCRIPT_1\"; print \"$SCRIPT_2\" }" $TARGET/index.html > $TARGET/index.html.new
  mv $TARGET/index.html.new $TARGET/index.html
fi
