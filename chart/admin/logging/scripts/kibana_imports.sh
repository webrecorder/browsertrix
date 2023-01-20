#!/bin/bash

ES_USER="elastic"
ES_PASS=$(kubectl get secret btrixlog-es-elastic-user -n btrix-admin -o go-template='{{.data.elastic | base64decode}}')
KIBANA_INGRESS="kibana-main"
HOSTNAME=`kubectl get ingress -A | grep $KIBANA_INGRESS | awk '{print $4}'`
KIBANA_URL="https://${HOSTNAME}/kibana"
EXPORT_FN="./kibana_export.ndjson"

echo "use $KIBANA_URL"

curl -k --user $ES_USER:$ES_PASS -X POST \
    "${KIBANA_URL}/api/saved_objects/_import" \
    -H "kbn-xsrf: true" \
    --form file=@$EXPORT_FN
