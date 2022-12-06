# Local Deployment

To just test out Browsertrix Cloud on your local machine, you can use many of the single-node Kubernetes tools.

Browsertrix Cloud has been tested with Docker Desktop (with Kubernetes enabled), microk8s, minikube and k3s.

Here are a few different ways to get started with Browsertrix Cloud. The instructions below assume you have cloned
the [https://github.com/webrecorder/browsertrix-cloud](https://github.com/webrecorder-browsertrix-cloud) repository locally,
and have local package managers for your platform (eg. `brew` for mac) already installed.

After following the environment-specific instructions below, simply run: 

```
helm upgrade --install -f ./chart/values.yaml -f ./chart/examples/local-config.yaml btrix ./chart/
```

The local setup includes the full Browsertrix Cloud system, with frontend, backend api, db (via MongoDB) and storage (via Minio)

An admin user with name `admin@example.com` and password `PASSW0RD!` will be automatically created.

These settings can be changed in [charts/examples/local-config.yaml](https://github.com/webrecorder/browsertrix-cloud/blob/main/chart/examples/local-config.yaml).

Note that the admin user and password will not be reset after creation.

To access the server load: **[http://localhost:30870/](http://localhost:30870/)** in your browser.

Here are some additional environment-specific deployment specific instructions:

### Docker Desktop (for Mac and Windows)

For Mac and Windows, we recommend testing out Browsertrix Cloud using Kubernetes support in Docker Desktop as that will be one of the simplest options.

To run Browsertrix Cloud on Docker Desktop:

1. Ensure `Enable Kubernetes` is checked from the Preferences screen.

2. Install [Helm](https://helm.sh/), which can be installed with `brew install helm` (Mac) or following some of the [other install options](https://helm.sh/docs/intro/install/)

3. Run the Helm command as described above.


### MicroK8S (for all platforms)

For Ubuntu and other linux distros, we recommend using MicroK8S for both local deployment and production.

1. Install MicroK8s, by running `sudo snap install microk8s --classic` [see more detailed instructions here](https://microk8s.io/docs/getting-started) or [alternate installation instructions here](https://microk8s.io/docs/install-alternatives)

2. Install the following addons `microk8s enable dns hostpath-storage registry helm3`. (For production, also add `ingress cert-manager` to the list of addons)

3. Wait for add-ons to finish installing with `microk8s status --wait-ready`

4. Run the Helm command as described above, prefixed with `microk8s`, eg. `microk8s helm3 ...`

### Minikube (for all platforms)

1. Install Minikube [following installation instructions](https://minikube.sigs.k8s.io/docs/start/), eg. `brew install minikube`

2. Install [Helm](https://helm.sh/), which can be installed with `brew install helm` or [other options](https://helm.sh/docs/intro/install/)

3. Run the Helm command as described above.

4. Mac Only: To access Browsertrix Cloud running in minikube on a mac, run `minikube service browsertrix-cloud-frontend --url` and then access Browsertrix Cloud via the provided URL. This is needed as Browsertrix Cloud is running in a VM.


## Waiting for Cluster to Start

After running the helm command, you should see something like:

```
Release "btrix" does not exist. Installing it now.
NAME: btrix
LAST DEPLOYED: <time>
NAMESPACE: default
STATUS: deployed
REVISION: 1
TEST SUITE: None
```

After that, especially on first run, it may take a few minutes for the Browsertrix Cloud cluster to start, as all images need to be loaded.

You can try running the command: `kubectl wait --for=condition=ready pod --all --timeout=300s` to wait for all pods to be initialized.

The command will exit when all pods have been loaded, or if there is an error and it times out.

If this command fails, you can also run `kubectl get pods` to see the status of each of the pods.

There should be 4 pods listed: backend, fronend, minio and mongodb. If any one is not ready for a while, something may be wrong.

### Debugging Pod Issues

To get more details about why a pod has not started, you can run `kubectl describe <podname>` and see the latest status at the bottom.

Often, the error may be obvious, such as failed to pull an image.

If the pod is running, or previously ran, you can also get the logs from the container by running `kubectl logs <podname>`

The outputs of these commands will be helpful if you'd like to report an issue [on GitHub](https://github.com/webrecorder/browsertrix-cloud/issues)

## Uninstalling

To uninstall, run `helm uninstall btrix`.

By default, the database + storage volumes are not automatically deleted. To fully delete all persistent data created in the cluster, also run `kubectl delete pvc --all`.


## Running With Local Images

By default, this setup will pull the latest release of Browsertrix Cloud. However, if you are developing locally, you may want to use your local images instead.

To do this:

1. open `./chart/examples/local-config.yaml` and add:

```
api_pull_policy: "IfNotPresent"
nginx_pull_policy: "IfNotPresent"
```

2. Rebuild the local images by running `docker-compose build`

3. Restart cluster by running Helm again.
