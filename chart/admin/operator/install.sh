#!/bin/bash

NAMESPACE=btrix-operator

# create namespace
kubectl create namespace $NAMESPACE

# intall metacontroller
git clone https://github.com/metacontroller/metacontroller.git
cd metacontroller
helm package deploy/helm/metacontroller --destination deploy/helm
helm install metacontroller download/metacontroller/deploy/helm/metacontroller-helm-v4.7.4.tgz -n $NAMESPACE
cd ..

# install BtrixJobs CRDs
kubectl apply -f ./btrixjobs-crd.yaml

#
# install metacontroller's compositecontroller
# note: this will refer the webhook endpoint 
#       request to http://btrixjob-controller.btrix-operator/sync
#
kubectl apply -f ./btrixjobs-controller.yaml -n $NAMESPACE
