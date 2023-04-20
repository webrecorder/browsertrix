# Writing documentation

Our documentation is built with [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) and configured via `mkdocs.yml` in the project root.

The docs can be found in the `./docs` subdirectory.

To build the docs locally, install Material for MkDocs with pip:

```shell
pip install mkdocs-material
```

In the project root directory run `mkdocs serve` to run a local version of the documentation site.

The docs hosted on [docs.browsertrix.cloud](https://docs.browsertrix.cloud) are created from the main branch of [https://github.com/webrecorder/browsertrix-cloud](https://github.com/webrecorder/browsertrix-cloud)

## Adding icons

We typically use the [Bootstrap icon set](https://icons.getbootstrap.com/) with our projects.  This set is quite expansive, and we don't add the entire set into our docs folder as most icons go unused.  If you wish to use an icon when writing documentation to refer to an icon present in part of the app, you may have to download the SVG file and add it to the repo.

Icons are placed in the `docs/overrides/.icons/iconsetname/icon-name.svg` directory, and can be added in markdown files as `:iconsetname-icon-name:` accordingly.  For more information, see the [Material for MKDocs page on Changing the logo and icons](https://squidfunk.github.io/mkdocs-material/setup/changing-the-logo-and-icons/#customization).

## Docs style guide

TODO!