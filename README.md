# Browsertrix Cloud

<p align="center"><img src="/frontend/assets/btrix-cloud.svg" width="128" height="128"></p>

Browsertrix Cloud is an open-source cloud-native high-fidelity browser-based crawling service designed
to make web archiving easier and more accessible for everyone.

The service provides an API and UI for scheduling crawls and viewing results,
and managing all aspects of crawling process. This system provides the orchestration and management around crawling,
while the actual crawling is performed using
[Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) containers, which are launched for each crawl.

See [Features](https://browsertrix.cloud/features) for a high-level list of planned features.

## Documentation

The full docs for using, deploying and developing Browsertrix Cloud are available at: [https://docs.browsertrix.cloud](https://docs.browsertrix.cloud)

## Deployment 

The latest deployment documentation is available at: [https://docs.browsertrix.cloud/deploy](https://docs.browsertrix.cloud/deploy)

The docs cover deploying Browsertrix Cloud in different environments using Kubernetes, from a single-node setup to scalable clusters in the cloud.

Previously, Browsertrix Cloud also supported Docker Compose and podman-based deployment. This is now deprecated due to the complexity
of maintaining feature parity across different setups, and with various Kubernetes deployment options being available and easy to deploy, even on a single machine.

Making deployment of Browsertrix Cloud as easy as possible remains a key goal, and we welcome suggestions for how we can further improve our Kubernetes deployment options.

If you are looking to just try running a single crawl, you may want to try [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) first to test out the crawling capabilities.

## Development Status

Browsertrix Cloud is currently in a beta, though the system and backend API is fairly stable, we are working on many additional features.

Additional developer documentation is available at [https://docs.browsertrix.cloud/dev](https://docs.browsertrix.cloud/dev)

Please see the GitHub issues and [this GitHub Project](https://github.com/orgs/webrecorder/projects/9) for our current project plan and tasks.


## License

Browsertrix Cloud is made available under the AGPLv3 License.

If you would like to use it under a different license or have a question, please reach out as that may be a possibility.
