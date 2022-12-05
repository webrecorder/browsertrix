# Browsertrix Cloud

<p align="center"><img src="/frontend/assets/btrix-cloud.svg" width="128" height="128"></p>

Browsertrix Cloud is an open-source cloud-native high-fidelity browser-based crawling service designed
to make web archiving easier and more accessible for everyone.

The service provides an API and UI for scheduling crawls and viewing results,
and managing all aspects of crawling process. This system provides the orchestration and management around crawling,
while the actual crawling is performed using
[Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) containers, which are launched for each crawl.

The system is designed to run in both Kubernetes and Docker Swarm, as well as locally under Podman.

See [Features](https://browsertrix.cloud/features) for a high-level list of planned features.


## Development Status

Browsertrix Cloud is currently in an early beta stage and not fully ready for production. This is an ambitious project and there's a lot to be done!

If you would like to help in a particular way, please open an issue or reach out to us in other ways.

## Documentation

Docs are available at: [https://docs.browsertrix.cloud/](https://docs.browsertrix.cloud/) created from the markdown in the [./docs](./docs) on the main branch.

To build the documentation locally, install Material for MkDocs with pip:

```shell
pip install mkdocs-material
```

In the project root directory run `mkdocs serve` to run a local version of the documentation site.

## License

Browsertrix Cloud is made available under the AGPLv3 License.

If you would like to use it under a different license or have a question, please reach out as that may be a possibility.
