# Browsertrix Cloud frontend

## Quickstart

Install dependencies:

```sh
yarn
```

Start the dev server:

```sh
yarn start-dev
```

This will open `localhost:9870` in a new tab in your default browser.

## Scripts

| `yarn <name>` |                                                                     |
| ------------- | ------------------------------------------------------------------- |
| `start-dev`   | runs app in development server, reloading on file changes           |
| `test`        | runs tests in chromium with playwright                              |
| `build-dev`   | bundles app and outputs it in `dist` directory                      |
| `build`       | bundles app app, optimized for production, and outputs it to `dist` |
| `lint`        | find and fix auto-fixable javascript errors                         |
| `format`      | formats js, html and css files                                      |

## Testing

Tests assertions are written in [Chai](https://www.chaijs.com/api/bdd/).

To watch for file changes while running tests:
```sh
yarn test --watch
```

To run tests in multiple browsers:
```sh
yarn test --browsers chromium firefox webkit
```
