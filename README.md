# Browsertrix Cloud

Browsertrix Cloud is a cloud-native crawling system, which supports a multi-user, multi-archive crawling system to run natively in the cloud via Kubernetes or locally via Docker.

The system currently includes support for the following:

- Fully API-driven, with OpenAPI specification for all APIs.
- Multiple users, registered via email and/or invited to join Archives.
- Crawling centered around Archives which are associated with an S3-compatible storage bucket.
- Users may be part of multiple archives and have different roles in different archives
- Archives contain crawler configs, which are passed to the crawler.
- Crawls launched via a crontab-based schedule or manually on-demand
- Crawls performed using [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler).
- Crawl config includes an optional timeout, after which crawl is stopped gracefully.
- Crawl status is tracked in the DB (possible crawl states include: Completed, Partially-Complete (due to timeout or cancelation), Cancelation, Failure)


## Deploying to Docker

To deploy via local Docker instance, copy the `config.sample.env` to `config.env`.

Docker Compose is required.

Then, run `docker-compose build; docker-compose up -d` to launch.

To update/relaunch, use `./docker-restart.sh`.

The API should be available at: `http://localhost:8000/docs`


Note: When deployed in local Docker, failed crawls are not retried currently. Scheduling is handled by a subprocess, which stores active schedule in the DB.



## Deploying to Kubernetes


To deploy to K8s, `helm` is required. Browsertrix Cloud comes with a helm chart, which can be installed as follows:

`helm install -f ./chart/values.yaml btrix ./chart/`

This will create a `browsertrix-cloud` service in the default namespace.

For a quick update, the following is recommended:

`helm upgrade -f ./chart/values.yaml btrix ./chart/`


Note: When deployed in Kubernetes, failed crawls are automatically retried. Scheduling is handled via Kubernetes Cronjobs, and crawl jobs are run in the `crawlers` namespace.




Browsertrix Cloud is currently in pre-alpha stages and not ready for production.

