# Deploying Browsertrix Cloud

Currently Browsertrix Cloud can be deployed in both Docker and Kubernetes.

Some basic instructions are provided below, we plan to expand this into more detail tutorial in the future.

## Deploying to Docker

For testing out Browsertrix Cloud on a single, local machine, the Docker Compose-based deployment is recommended.

To deploy via local Docker instance, copy the `config.sample.env` to `config.env`.

Docker Compose is required.

Then, run `docker-compose build; docker-compose up -d` to launch.

To update/relaunch, use `./docker-restart.sh`.

The API documentation should be available at: `http://localhost:9871/api/docs`.

To allow downloading of WACZ files via the UI from a remote host, set the `STORE_ACCESS_ENDPOINT_URL` to use the domain of the host.
Otherwise, the files are accesible only through the default Minio service running on port 9000.


Note: When deployed in local Docker, failed crawls are not retried currently. Scheduling is handled by a subprocess, which stores active schedule in the DB.


### Enabling Signing

Browsertrix Cloud can optionally sign WACZ files with the same key used to generate an SSL cert.
To use this functionality, the machine running Browsertrix Cloud must be associated with a domain and must have port 80 available on that domain.

To enable signing in the Docker-based deployment:

1) Copy `configs/signing.sample.yaml` to `configs/signing.yaml` and set the domain and email fields in the config. Set `staging` to false to generate real certificates.

2) In `configs.config.env`, also uncomment `WACZ_SIGN_URL`.


WACZ files created on minio should now be signed! Be sure to also set `STORE_ACCESS_ENDPOINT_URL` to get downloadable links from the UI downloads view.


## Deploying to Kubernetes

For deploying in the cloud and across multiple machines, the Kubernetes (k8s) deployment is recommended.

To deploy to K8s, `helm` is required. Browsertrix Cloud comes with a helm chart, which can be installed as follows:

`helm install -f ./chart/values.yaml btrix ./chart/`

This will create a `browsertrix-cloud` service in the default namespace.

For a quick update, the following is recommended:

`helm upgrade -f ./chart/values.yaml btrix ./chart/`


Note: When deployed in Kubernetes, failed crawls are automatically retried. Scheduling is handled via Kubernetes Cronjobs, and crawl jobs are run in the `crawlers` namespace.


