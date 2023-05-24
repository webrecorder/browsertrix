# Running the Backend

## Installation

See our [Local Deployment guide](../deploy/local.md#installing-kubernetes) for instructions on how to install [Kubernetes](https://kubernetes.io/) with [Helm 3](https://v3.helm.sh/).

## Configuration

For quick setup, we've provided a Helm chart configuration file `examples/local-config.yaml`, which you can copy as `local.yaml`. From the root directory:

```sh
cp ./chart/examples/local-config.yaml ./chart/local.yaml
```

Changes to `local.yaml` will not be tracked in git.

Uncomment pull policies in `./chart/local.yaml`, which will ensure only local images are used:

```yaml
backend_pull_policy: 'Never'
frontend_pull_policy: 'Never'
```

??? info "If using MicroK8S"

    Replace `"Never"` with `"IfNotPresent"` and uncomment out `backend_image` and `frontend_image`. You should have something like:

    ```yaml
    backend_pull_policy: "IfNotPresent"
    frontend_pull_policy: "IfNotPresent"
    backend_image: "localhost:32000/webrecorder/browsertrix-backend:latest"
    frontend_image: "localhost:32000/webrecorder/browsertrix-frontend:latest"
    ```

Uncomment `superuser` to enable a default superuser admin:

```yaml
superuser:
  # set this to enable a superuser admin
  email: admin@example.com

  # optional: if not set, automatically generated
  # change or remove this
  password: PASSWORD!
```

## Building & Running

Follow the instructions in [Running With Local Images](../deploy/local.md#running-with-local-images) according to your Kubernetes deployment in use.

Once the images have been built, run the following to launch Browsertrix Cloud locally:

```sh
helm upgrade --install -f ./chart/values.yaml \
    -f ./chart/local.yaml btrix ./chart/
```

Refer to our [Local Development guide](../deploy/local.md#waiting-for-cluster-to-start) for additional information on running and debugging your local cluster.
