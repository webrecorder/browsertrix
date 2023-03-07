# BtrixJob Operator

## Installation

```
helm upgrade --install -f ./chart/admin/operator/values.yaml btrix-operator ./chart/admin/operator
```

## Uninstallation

```
helm uninstall btrix-operator
```

## Upgrade dependencies

* To upgrade metacontroller, it needs to run the following command and bump the versin number in `Chart.yaml`.

```
./build_dep.sh
```
