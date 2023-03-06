#!/bin/bash

NAMESPACE=btrix-operator

kubectl delete -f ./btrixjobs-controller.yaml -n $NAMESPACE
kubectl delete -f ./btrixjobs-crd.yaml
kubectl delete namespace $NAMESPACE
