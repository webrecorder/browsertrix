# Deploying Browsertrix Cloud

Currently Browsertrix Cloud can be deployed in both Docker and Kubernetes.

Some basic instructions are provided below, we plan to expand this into more detail tutorial in the future.

## Deploying to Docker

For testing out Browsertrix Cloud on a single, local machine, the Docker Compose-based deployment is recommended.

To deploy via local Docker instance, copy the `config.sample.env` to `config.env`.

Docker Compose is required.

Then, run `docker-compose build; docker-compose up -d` to launch.

To update/relaunch, use `./docker-restart.sh`.

The API should be available at: `http://localhost:8000/docs`


Note: When deployed in local Docker, failed crawls are not retried currently. Scheduling is handled by a subprocess, which stores active schedule in the DB.



## Deploying to Kubernetes

For deploying in the cloud and across multiple machines, the Kubernetes (k8s) deployment is recommended.

To deploy to K8s, `helm` is required. Browsertrix Cloud comes with a helm chart, which can be installed as follows:

`helm install -f ./chart/values.yaml btrix ./chart/`

This will create a `browsertrix-cloud` service in the default namespace.

For a quick update, the following is recommended:

`helm upgrade -f ./chart/values.yaml btrix ./chart/`


Note: When deployed in Kubernetes, failed crawls are automatically retried. Scheduling is handled via Kubernetes Cronjobs, and crawl jobs are run in the `crawlers` namespace.


