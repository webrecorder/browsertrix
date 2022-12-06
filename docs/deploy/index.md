# Introduction

Browsertrix Cloud is designed to be a cloud-native application running in Kubernetes.

However, despite the name, it is perfectly reasonable (and easy!) to deploy Browsertrix Cloud locally using one of the many available local Kubernetes options. Here are a few recommendations for different scenarios.

The main requirements for Browsertrix Cloud are:

- A Kubernetes Cluster
- Helm 3 (package manager for Kubernetes)

We have prepared a [Local Deployment](./local) and [Production (Self-Hosted and Cloud) Deployment](./production) guides to help with
setting up Browsertrix Cloud for different scenarios.

### Non Kubernetes Deployments

Previously, Browsertrix Cloud also supported Docker Compose and podman-based deployment. This is now deprecated due to the complexity
of maintaining feature parity across different setups, and with various Kubernetes deployment options being available and easy to deploy, even on a single machine.

Making deployment of Browsertrix Cloud as easy as possible is a key goal!

[Please open an issue](https://github.com/webrecorder/browsertrix-cloud/issues/new) if you have suggestions on how we can further improve our deployment options!

