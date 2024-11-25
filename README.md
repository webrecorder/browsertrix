<h1>
    <div align="center">
        <img alt="Browsertrix" src="assets/browsertrix-lockup-color-dynamic.svg" width="90%">
    </div>
</h1>

&nbsp;

Browsertrix is a cloud-native, high-fidelity, browser-based crawling service designed to make web archiving easier and more accessible for everyone.

The service provides an API and UI for scheduling crawls and viewing results, and managing all aspects of crawling process. This system provides the orchestration and management around crawling, while the actual crawling is performed using [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) containers, which are launched for each crawl.

See [webrecorder.net/browsertrix](https://webrecorder.net/browsertrix) for a feature overview and information about how to sign up for Webrecorder's hosted Browsertrix service.

## Documentation

The full docs for using, deploying, and developing Browsertrix are available at [docs.browsertrix.com](https://docs.browsertrix.com).

Our docs are created with [Material for MKDocs](https://squidfunk.github.io/mkdocs-material/).

## Deployment

The latest deployment documentation is available at [docs.browsertrix.com/deploy](https://docs.browsertrix.com/deploy).

The docs cover deploying Browsertrix in different environments using Kubernetes, from a single-node setup to scalable clusters in the cloud.

Early on, Browsertrix also supported Docker Compose and podman-based deployment. This was deprecated due to the complexity of maintaining feature parity across different setups, and with various Kubernetes deployment options being available and easy to deploy, even on a single machine.

Making deployment of Browsertrix as easy as possible remains a key goal, and we welcome suggestions for how we can further improve our Kubernetes deployment options.

If you are looking to just try running a single crawl, you may want to try [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) first to test out the crawling capabilities.

## Contributing

Though the system and backend API is fairly stable, we are working on many additional features. Please see the GitHub issues and [this GitHub Project](https://github.com/orgs/webrecorder/projects/9) for our current project plan and tasks.

Guides for getting started with local development are available at [docs.browsertrix.com/develop](https://docs.browsertrix.com/develop/).

### Translation

We use [Weblate](https://hosted.weblate.org/engage/browsertrix/) to manage translation contributions.

<img src="https://hosted.weblate.org/widget/browsertrix/browsertrix-ui/multi-auto.svg" alt="Translation status" />

## License

Browsertrix is made available under the AGPLv3 License.

Documentation is made available under the Creative Commons Attribution 4.0 International License
