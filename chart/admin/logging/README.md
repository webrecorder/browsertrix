# Btrix Logging Service

## Prerequisites

1. [optional] add a new node for a dedicated logging stacks (Elasticsearch, Fluentd, Kibana)
1. [optional] set a label for a node with `NodeType=admin` (when `dedicatedNode` is `true`)
```
kubectl label nodes new-admin-node nodeType=admin
```
1. edit `chart/values.yaml` to enable `logging` service when install with browsestrix-cloud
```
addons:
  admin:
    logging: true
```
This will enable the helm dependencies defined in `chart/Chart.yaml`.

And, edit `chart/examples/local-logging.yaml` for a local test.

Optionally, when install the logging service only, edit `chart/admin/logging/values.yaml`.
For a local test, it should use a hostname (not `localhost` but a hostname like `myhostname` registered in `/etc/hosts`)

# Modes

* Lightweight File mode (Fluentd only mode): set `logging.fileMode` to `true`
  * This will disable Elasticsearch, Kibana and Ingress.
  * Log files will be placed in each node's `/var/log/fluentd/`.
  * Log file's retention period: 3 days (see `templates/fluentd.yaml`)

## Installation

* run a setup script (will create a namespace and install elastic's CRDS)
```
$ ./chart/admin/logging/scripts/eck_install.sh
```
* install logging services using helm chart
```
helm upgrade --install -f ./chart/values.yaml -f ./chart/examples/local-logging.yaml  btrix ./chart
```

## Installation (logging service only)

* run a setup script (will create a namespace and install elastic's CRDS)
```
$ ./chart/admin/logging/scripts/eck_install.sh
```
* install logging services using helm chart
```
helm upgrade --install -f ./chart/admin/logging/values.yaml btrix-admin-log ./chart/admin/logging
```

## Access Kibana dashboard

* get the Kibana's login password (username: `elastic`)
```
kubectl get secret btrixlog-es-elastic-user -n btrix-admin -o go-template='{{.data.elastic | base64decode}}'
```
* open `https://hostname/kibana/` (note the trailing slash is required)

## Import/Export Kibana data

* Import data (e.g. data view, search queries and dashboards)

```
cd ./chart/admin/logging/scripts
./kibana_imports.sh
```

* Exports data (e.g. data view, search queries and dashboards)

```
cd ./chart/admin/logging/scripts
./kibana_exports.sh
```

## Uninstallation

```
$ helm uninstall btrix-admin-log
$ ./chart/admin/logging/scripts/eck_uninstall.sh
```
