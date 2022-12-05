# Local Deployment

To just test out Browsertrix Cloud on your local machine, you can use many of the single-node Kubernetes tools.

Browsertrix Cloud has been tested with Docker Desktop (with Kubernetes enabled), microk8s, minikube and k3s.

Here are a few different ways to get started with Browsertrix Cloud. The instructions below assume you have cloned
the [https://github.com/webrecorder/browsertrix-cloud](https://github.com/webrecorder-browsertrix-cloud) repository locally,
and have local package managers for your platform (eg. `brew` for mac) already installed.

After following the environment-specific instructions below, simply run: 

`helm upgrade --install -f ./chart/values.yaml -f ./chart/local-config.yaml btrix ./chart/`

The local setup includes the full Browsertrix Cloud system, with frontend, backend api, db (via MongoDB) and storage (via Minio)

An admin user with name `admin@example.com` and password `PASSW0RD!` will be automatically created.

These settings can be changed in `charts/examples/local-config.yaml`. Note that the admin user and password will not be reset after creation.

To access the server load: [http://localhost:30870/](http://localhost:30870/) in your browser.

Here are some additional environment-specific deployment specific instructions:

### Docker Desktop -- Mac

For Mac, we recommend testing out Browsertrix Cloud on Docker Desktop as that will be one of the simplest options.

To run Browsertrix Cloud on Docker Desktop:

1. Ensure `Enable Kubernetes` is checked from the Preferences screen.

2. Install [Helm](https://helm.sh/), which can be installed with `brew install helm` or [other options](https://helm.sh/docs/intro/install/)

3. Run the Helm command as described above.

### MicroK8S

For Ubuntu and other linux distros, we recommend using MicroK8S for both local deployment and production.

1. Install MicroK8s, by running `sudo snap install microk8s --classic` [see more detailed instructions here](https://microk8s.io/docs/getting-started) or [alternate installation instructions here](https://microk8s.io/docs/install-alternatives)

2. Install the following addons `microk8s enable dns hostpath-storage registry helm`. (For production, also add `ingress cert-manager`)

3. Wait for add-ons to finish installing with `microk8s status --wait-ready`

4. Run the Helm command as described above, prefixed with `microk8s`, eg. `microk8s helm ...`

### Minikube

1. Install Minikube [following installation instructions](https://minikube.sigs.k8s.io/docs/start/), eg. `brew install minikube`

2. Run the Helm command as described above.

## Uninstalling

To uninstall, simply run `helm unininstall btrix`

