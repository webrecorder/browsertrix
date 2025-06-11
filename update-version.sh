#!/usr/bin/env bash

version=`cat version.txt`
jq ".version=\"$version\"" ./frontend/package.json > ./tmp-package.json
mv ./tmp-package.json ./frontend/package.json

echo '"""current version"""' > ./backend/btrixcloud/version.py
echo "" >> ./backend/btrixcloud/version.py
echo "__version__ = \"$version\"" >> ./backend/btrixcloud/version.py

sed -E -i "" "s/^version:.*$/version: v$version/" chart/Chart.yaml

sed -E -i "" "s/\/browsertrix-backend:[[:alnum:].-]+/\/browsertrix-backend:$version/" chart/values.yaml
sed -E -i "" "s/\/browsertrix-frontend:[[:alnum:].-]+/\/browsertrix-frontend:$version/" chart/values.yaml

# Update the version & release URL in CITATION.cff
sed -E -i "" "s/^version: [0-9]+\.[0-9]+\.[0-9]+$/version: $version/" CITATION.cff
sed -E -i "" "s|(https://github.com/webrecorder/browsertrix/releases/tag/)v[0-9]+\.[0-9]+\.[0-9]+|\1v$version|" CITATION.cff
