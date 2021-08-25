# Browsertrix Cloud

Browsertrix Cloud is a cloud-native crawling system, which supports a multi-user, multi-archive crawling system to run natively in the cloud via Kubernetes or locally via Docker.

The system currently includes support for the following:

- Multiple users, registered via email and/or invited to join Archives.
- Crawling centered around Archives which are associated with an S3-compatible storage bucket.
- Users may be part of multiple archives and have different roles in different archives
- Archives contain crawler configs, which are passed to the crawler.
- Crawls launched via a crontab-based schedule or manually on-demand
- Crawls performed using [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler).
- Crawl config includes an optional timeout, after which crawl is stopped gracefully.
- Crawl status is tracked in the DB (possible crawl states include: Completed, Partially-Complete (due to timeout or cancelation), Cancelation, Failure)


When deployed in Kubernetes, failed crawls are automatically retried. Scheduling is handled via Kubernetes Cronjobs.

when deployed in local Docker, failed crawls are not retried currently. Scheduling is handled by a subprocess, which stores active schedule in the DB.

Browsertrix Cloud is currently in pre-alpha stages and not ready for production.

