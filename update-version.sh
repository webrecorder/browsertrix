#!/usr/bin/env bash

version=`cat version.txt`
jq ".version=\"$version\"" ./frontend/package.json > ./tmp-package.json
mv ./tmp-package.json ./frontend/package.json

echo '""" current version """' > ./backend/btrixcloud/version.py
echo "__version__ = \"$version\"" >> ./backend/btrixcloud/version.py
