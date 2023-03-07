#!/bin/bash

# intall metacontroller
git clone --depth=1 https://github.com/metacontroller/metacontroller.git
cd metacontroller
helm package deploy/helm/metacontroller --destination deploy/helm
cd ..

# update dependency
helm dependency build

rm -rf ./metacontroller
