# Browsertrix Cloud frontend

## Quickstart

Copy environment variables from the sample file:

```sh
cp sample.env.local .env.local
```

Install dependencies:

```sh
yarn
```

Start the dev server:

```sh
yarn start-dev
```

This will open `localhost:9870` in a new tab in your default browser.

To develop against a local instance of the backend API,
follow instructions for deploying to a local Docker instance. Update `API_BASE_URL` and then restart the dev server.

## Scripts

| `yarn <name>`      |                                                                     |
| ------------------ | ------------------------------------------------------------------- |
| `start-dev`        | runs app in development server, reloading on file changes           |
| `test`             | runs tests in chromium with playwright                              |
| `build-dev`        | bundles app and outputs it in `dist` directory                      |
| `build`            | bundles app app, optimized for production, and outputs it to `dist` |
| `lint`             | find and fix auto-fixable javascript errors                         |
| `format`           | formats js, html and css files                                      |
| `localize:extract` | generate XLIFF file to be translated                                |
| `localize:build`   | output a localized version of strings/templates                     |

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

## Localization

To add new languages:

1. Add [BCP 47 language tag](https://www.w3.org/International/articles/language-tags/index.en) to `targetLocales` in `lit-localize.json`
2. Run `yarn localize:extract` to generate new .xlf file in `/xliff`
3. Provide .xlf file to translation team
4. Replace .xlf file once translated
5. Run `yarn localize:build` bring translation into `src`

See: <https://lit.dev/docs/localization/overview>
