#!/bin/bash

kubectl create namespace btrix-admin
kubectl create -f https://download.elastic.co/downloads/eck/2.5.0/crds.yaml
kubectl apply -f https://download.elastic.co/downloads/eck/2.5.0/operator.yaml

# kubectl label nodes docker-desktop nodeType=admin
kubectl get nodes
kubectl get nodes -o wide -o jsonpath='{.items[*].metadata.labels}' | jq .
