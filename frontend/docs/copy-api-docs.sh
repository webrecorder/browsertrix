#!/usr/bin/env bash
CURR=$(dirname "${BASH_SOURCE[0]}")

TARGET=$CURR/docs/api/
mkdir $TARGET
curl "$DOCS_SOURCE_URL/api/openapi.json" > $TARGET/openapi.json
curl "$DOCS_SOURCE_URL/api/redoc" > $TARGET/index.html
curl "$DOCS_SOURCE_URL/docs-logo.svg" > $TARGET/../docs-logo.svg
