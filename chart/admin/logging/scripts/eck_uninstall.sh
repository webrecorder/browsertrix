#!/bin/bash

kubectl delete -f https://download.elastic.co/downloads/eck/2.5.0/operator.yaml
kubectl delete -f https://download.elastic.co/downloads/eck/2.5.0/crds.yaml
kubectl delete namespace btrix-admin
