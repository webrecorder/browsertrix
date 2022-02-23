# Browsertrix Cloud

<p align="center"><img src="/frontend/assets/btrix-cloud.svg" width="128" height="128"></p>

Browsertrix Cloud is an open-source cloud-native high-fidelity browser-based crawling service designed
to make web archiving easier and more accessible for everyone.

The service provides an API and UI for scheduling crawls and viewing results,
and managing all aspects of crawling process.

The actual crawls are performed using [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler).

The system is designed to run equally in Kubernetes and Docker.

See [Features](https://browsertrix.cloud/features) for a high-level list of planned features.


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

## Status

Browsertrix Cloud is currently in pre-alpha stages and not ready for production. This is an ambitious project and there's a lot to be done!

If you would like to help in a particular way, please open an issue or reach out to us in other ways.

## License

Browsertrix Cloud is made available under the AGPLv3 License.

If you would like to use it under a different license or have a question, please reach out as that may be a possibility.


