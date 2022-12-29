#!/bin/bash

ES_USER="elastic"
ES_PASS=$(kubectl get secret btrixlog-es-elastic-user -n btrix-admin -o go-template='{{.data.elastic | base64decode}}')
KIBANA_INGRESS="kibana-main"
HOSTNAME=`kubectl get ingress -A | grep $KIBANA_INGRESS | awk '{print $4}'`
KIBANA_URL="https://${HOSTNAME}/kibana"
EXPORT_FN="./kibana_export.ndjson"

echo "use $KIBANA_URL"

RET=`curl --user $ES_USER:$ES_PASS \
    "${KIBANA_URL}/api/kibana/management/saved_objects/_find?perPage=50&page=1&fields=id&type=url&type=index-pattern&type=action&type=query&type=alert&type=search&type=graph-workspace&type=tag&type=csp_rule&type=csp-rule-template&type=visualization&type=canvas-element&type=canvas-workpad&type=dashboard&type=lens&type=map&type=cases&type=osquery-saved-query&type=osquery-pack&type=uptime-dynamic-settings&type=synthetics-privates-locations&type=infrastructure-ui-source&type=metrics-explorer-view&type=inventory-view&type=infrastructure-monitoring-log-view&type=apm-indices&sortField=updated_at&sortOrder=desc" | \
    jq -r ".saved_objects | [.[] | { id:.id, type:.type}] | @json"`

curl --user $ES_USER:$ES_PASS -X POST \
    "${KIBANA_URL}/api/saved_objects/_export" \
    -H 'kbn-xsrf: true' \
    -H 'Content-Type: application/json' \
    -d "{\"objects\": $RET }" > $EXPORT_FN
