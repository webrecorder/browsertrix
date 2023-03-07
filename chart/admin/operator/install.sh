#!/bin/bash

NAMESPACE=btrix-operator

# create namespace
kubectl create namespace $NAMESPACE

# intall metacontroller
git clone https://github.com/metacontroller/metacontroller.git
cd metacontroller
helm package deploy/helm/metacontroller --destination deploy/helm
helm install metacontroller deploy/helm/$(ls deploy/helm | grep tgz) -n $NAMESPACE
cd ..

# install BtrixJobs CRDs
kubectl apply -f ./btrixjobs-crd.yaml

#
# install metacontroller's compositecontroller
# note: this will refer the webhook endpoint 
#       request to http://btrixjob-controller.btrix-operator/sync
#
kubectl apply -f ./btrixjobs-controller.yaml -n $NAMESPACE
kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=metacontroller -n $NAMESPACE
