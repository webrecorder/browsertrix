# Deploying Browsertrix Cloud

Browsertrix Cloud is designed to be a cloud-native application running in Kubernetes.

However, despite the name, it is perfectly reasonable (and easy!) to deploy Browsertrix Cloud locally using one of the many available local Kubernetes options.

The main requirements for Browsertrix Cloud are:

- A Kubernetes Cluster
- [Helm 3](https://helm.sh/) (package manager for Kubernetes)


We have prepared a [Local Deployment Guide](local.md) which covers several options for testing Browsertrix Cloud locally on a single machine, as well as a [Production (Self-Hosted and Cloud) Deployment](remote.md) guide to help with setting up Browsertrix Cloud in different production scenarios. Information about configuring storage, crawler channels, and other details in local or production deployments is in the [Customizing Browsertrix Deployment Guide](customization.md).
