# Running Frontend

This guide explains how to deploy an instance of the Browsertrix Cloud frontend for development.
The frontend can connect to a Browsertrix Cloud API backend running locally or remotely.

## Quickstart

Ensure the current working directory is set to the `/frontend` folder.

Install dependencies:

```sh
yarn
```

Copy environment variables from the sample file:

```sh
cp sample.env.local .env.local
```

Update `API_BASE_URL` in `.env.local` to point to your dev backend API. For example:

```
API_BASE_URL=http://dev.example.com/api
```

If connecting to a local deployment cluster, set API_BASE_URL to:

```
API_BASE_URL=http://localhost:30870/api
```

Start the dev server:

```sh
yarn start
```

This will open `localhost:9870` in a new tab in your default browser.

To develop against a local instance of the backend API,
follow instructions for deploying to a local Docker instance. Update `API_BASE_URL` and then restart the dev server.

## Scripts

| `yarn <name>`      |                                                                 |
| ------------------ | --------------------------------------------------------------- |
| `start`            | runs app in development server, reloading on file changes       |
| `test`             | runs tests in chromium with playwright                          |
| `build-dev`        | bundles app and outputs it in `dist` directory                  |
| `build`            | bundles app, optimized for production, and outputs it to `dist` |
| `lint`             | find and fix auto-fixable javascript errors                     |
| `format`           | formats js, html and css files                                  |
| `localize:extract` | generate XLIFF file to be translated                            |
| `localize:build`   | output a localized version of strings/templates                 |

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

Wrap text or templates in the `msg` helper to make them localizable:

```js
// import from @lit/localize:
import { msg } from "@lit/localize";

// later, in the render function:
render() {
  return html`
    <button>
      ${msg("Click me")}
    </button>
  `
}
```

Entire templates can be wrapped as well:

```js
render() {
  return msg(html`
    <p>Click the button</p>
    <button>Click me</button>
  `)
}
```

See: <https://lit.dev/docs/localization/overview/#message-types>

To add new languages:

1. Add [BCP 47 language tag](https://www.w3.org/International/articles/language-tags/index.en) to `targetLocales` in `lit-localize.json`
2. Run `yarn localize:extract` to generate new .xlf file in `/xliff`
3. Provide .xlf file to translation team
4. Replace .xlf file once translated
5. Run `yarn localize:build` bring translation into `src`

See: <https://lit.dev/docs/localization/overview/#extracting-messages>
