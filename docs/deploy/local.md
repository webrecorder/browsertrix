# Local Deployment

To just test out Browsertrix Cloud on your local machine, you'll first need to have a working Kubernetes cluster.

## Installing Kubernetes

Before running Browsertrix Cloud, you'll need to set up a running Kubernetes cluster.

Today, there are numerous ways to deploy Kubernetes fairly easily, and we recommend trying one of the single-node options, which include Docker Desktop, microk8s, minikube and k3s.

The instructions below assume you have cloned
the [https://github.com/webrecorder/browsertrix-cloud](https://github.com/webrecorder/browsertrix-cloud) repository locally,
and have local package managers for your platform (eg. `brew` for Mac, `choco` for Windows, etc...) already installed.

Here are some environment specific instructions for setting up a local cluster from different Kubernetes vendors:

??? tip "Docker Desktop (recommended for Mac and Windows)"

    For Mac and Windows, we recommend testing out Browsertrix Cloud using Kubernetes support in Docker Desktop as that will be one of the simplest options.

    1. [Install Docker Desktop](https://www.docker.com/products/docker-desktop/) if not already installed.

    2. From the Dashboard app, ensure `Enable Kubernetes` is checked from the Preferences screen.

    3. Restart Docker Desktop if asked, and wait for it to fully restart.

    4. Install [Helm](https://helm.sh/), which can be installed with `brew install helm` (Mac) or `choco install kubernetes-helm` (Windows) or following some of the [other install options](https://helm.sh/docs/intro/install/)


??? tip "MicroK8S (recommended for Ubuntu)"

    For Ubuntu and other linux distros, we recommend using MicroK8S for both local deployment and production.

    1. Install MicroK8s, by running `sudo snap install microk8s --classic` [see more detailed instructions here](https://microk8s.io/docs/getting-started) or [alternate installation instructions here](https://microk8s.io/docs/install-alternatives)

    2. Install the following addons `microk8s enable dns hostpath-storage registry helm3`. (For production, also add `ingress cert-manager` to the list of addons)

    3. Wait for add-ons to finish installing with `microk8s status --wait-ready`

    Note: microk8s comes with its own version helm, so you don't need to install it separately. Replace `helm` with `microk8s helm3` in the subsequent instructions below.

??? tip "Minikube (Windows, Mac or Linux)"

    1. Install Minikube [following installation instructions](https://minikube.sigs.k8s.io/docs/start/), eg. `brew install minikube`

    2. Install [Helm](https://helm.sh/), which can be installed with `brew install helm` (Mac) or `choco install kubernetes-helm` (Windows) or following some of the [other install options](https://helm.sh/docs/intro/install/)

    3. Run the Helm command as described above.

    4. Mac Only: To access Browsertrix Cloud running in minikube on a mac, run `minikube service browsertrix-cloud-frontend --url` and then access Browsertrix Cloud via the provided URL. This is needed as Browsertrix Cloud is running in a VM.

??? tip "K3S (recommended for non-Ubuntu Linux)"

    1. Install K3s [as per the instructions](https://docs.k3s.io/quick-start)

    2. Install [Helm](https://helm.sh/), which can be installed with `brew install helm` (Mac) or `choco install kubernetes-helm` (Windows) or following some of the [other install options](https://helm.sh/docs/intro/install/)

    3. Set `KUBECONFIG` to point to the config for K3S: `export KUBECONFIG=/etc/rancher/k3s/k3s.yaml` to ensure Helm will use the correct version.


## Launching Browsertrix Cloud with Helm

Once you have a running Kubernetes cluster with one of the options above, and Helm 3 installed, you can then run from the Browsertrix Cloud repo directory:

```
helm upgrade --install -f ./chart/values.yaml -f ./chart/examples/local-config.yaml btrix ./chart/
```

The local setup includes the full Browsertrix Cloud system, with frontend, backend api, db (via MongoDB) and storage (via Minio)

An admin user with name `admin@example.com` and password `PASSW0RD!` will be automatically created.

This config uses the standard config (`./chart/values.yaml`) with a couple additional settings for local deployment (`./chart/examples/local-config.yaml`). With Helm, additional YAML files can be added to further override previous settings.

These settings can be changed in [charts/examples/local-config.yaml](https://github.com/webrecorder/browsertrix-cloud/blob/main/chart/examples/local-config.yaml).

Note that the admin user and password will not be reset after creation.


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

After that, especially on first run, it may take a few minutes for the Browsertrix Cloud cluster to start, as all images need to be downloaded locally.

You can try running the command: `kubectl wait --for=condition=ready pod --all --timeout=300s` to wait for all pods to be initialized.

The command will exit when all pods have been loaded, or if there is an error and it times out.

If the command succeeds, you should be able to access Browsertrix Cloud by loading: **[http://localhost:30870/](http://localhost:30870/)** in your browser.

### Debugging Pod Issues

If this command fails, you can also run `kubectl get pods` to see the status of each of the pods.

There should be 4 pods listed: backend, frontend, minio and mongodb. If any one is not ready for a while, something may be wrong.

To get more details about why a pod has not started, you can run `kubectl describe <podname>` and see the latest status at the bottom.

Often, the error may be obvious, such as failed to pull an image.

If the pod is running, or previously ran, you can also get the logs from the container by running `kubectl logs <podname>`

The outputs of these commands will be helpful if you'd like to report an issue [on GitHub](https://github.com/webrecorder/browsertrix-cloud/issues)

## Updating the Cluster

To update the cluster, re-run the same command again, which will pull the latest images. In this way, you can upgrade to the latest release of Browsertrix Cloud. The upgrade will preserve the database and current archives.

```
helm upgrade --install -f ./chart/values.yaml -f ./chart/examples/local-config.yaml btrix ./chart/
```

## Uninstalling

To uninstall, run `helm uninstall btrix`.

By default, the database + storage volumes are not automatically deleted, so you can run `helm upgrade...` again to restart the cluster in its current state.

To fully delete all persistent data created in the cluster, also run `kubectl delete pvc --all` after uninstalling.


## Running With Local Images

By default, this setup will pull the latest release of Browsertrix Cloud. However, if you are developing locally, you may want to use your local images instead.

First, open `./chart/examples/local-config.yaml` and add the following, which will ensure only local images are used:

```
backend_pull_policy: "Never"
frontend_pull_policy: "Never"
```

Now, rebuild either the backend and/or frontend images locally. The exact process depends on the Kubernetes deployment in use:


??? tip "Docker Desktop"

    Rebuild the local images by running `./scripts/build-backend.sh` and/or `./scripts/build-frontend.sh` scripts to build the images in the local Docker.


??? tip "MicroK8S"

    MicroK8s uses its own container registry, running on port 32000. 

    1. Set `export REGISTRY=localhost:32000/` and then run `./scripts/build-backend.sh` and/or `./scripts/build-frontend.sh` to rebuild the images into the MicroK8S registry. 

    2. In `./chart/examples/local-config.yaml`, uncomment out one or both of the following lines to use the local images:

    ```
    backend_image: "localhost:32000/webrecorder/browsertrix-backend:latest"
    frontend_image: "localhost:32000/webrecorder/browsertrix-frontend:latest"
    ```

??? tip "Minikube" 

    Minikube comes with its own image builder to update the images used in Minikube.

    To build the backend image, run:

    ```
    minikube image build -t webrecorder/browsertrix-backend:latest ./backend
    ```

    To build a local frontend image, run:
    ```
    minikube image build -t webrecorder/browsertrix-frontend:latest ./frontend
    ```

??? tip "K3S"

    K3S uses `containerd` by default. To use local images, they need to be imported after rebuilding.

    1. Rebuild the images with Docker by running by running `./scripts/build-backend.sh` and/or `./scripts/build-frontend.sh` scripts. (Requires Docker to be installed as well).

    2. Serializer the images to .tar:

    ```
    docker save webrecorder/browsertrix-backend:latest > ./backend.tar
    docker save webrecorder/browsertrix-frontend:latest > ./frontend.tar
    ```

    3. Import images into k3s containerd:

    ```
    k3s ctr images import --base-name webrecorder/browsertrix-backend:latest ./backend.tar
    k3s ctr images import --base-name webrecorder/browsertrix-frontend:latest ./frontend.tar
    ```

Once the images have been built and any other config changes made per the above instructions, simply run the `helm upgrade...` command again to restart with local images.
