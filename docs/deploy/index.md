# Introduction

Browsertrix Cloud is designed to be a cloud-native application running in Kubernetes.

However, despite the name, it is perfectly reasonable (and easy!) to deploy Browsertrix Cloud locally using one of the many available local Kubernetes

options. Here are a few recommendations for different scenarios.

The main requirements for Browsertrix Cloud are:

- A Kubernetes Cluster
- kubectl
- helm

For production installation, we also recommend:

- A dedicated domain for accessing Browsertrix Cloud
- A second domain for signing web archives
- Ansible (for cloud deployment)


We have prepared a [./local](Local Deployment) and [./cloud](Cloud and Production Deployment) guides to help with
setting up Browsertrix Cloud for different 

