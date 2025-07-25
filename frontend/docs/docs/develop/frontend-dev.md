# Developing with Yarn

This guide explains how to build and serve the Browsertrix user interface with [Yarn](https://classic.yarnpkg.com).

Developing the user interface with Yarn bypasses the need to rebuild the entire frontend Docker image to view your UI changes. This setup is ideal for rapid UI development that does not rely on any backend changes.

## Requirements

### 1. Browsertrix API backend already in a Kubernetes cluster

The frontend development server requires an existing backend that has been deployed locally or is in production. See [Deploying Browsertrix](../deploy/index.md).

Once deployed, make note of the URL to the backend API. If you've deployed the backend locally using default values, the URL will be `http://localhost:30870`.

### 2. Node.js ≥20

To check if you already have Node.js installed, run the following command in your command line terminal:

```sh
node --version
```

You should see a version number like `v20.17.0`. If you see a command line error instead of a version number, [install Node.js](https://nodejs.org/en/download/package-manager) before continuing.

??? question "What if my other project requires a different version of Node.js?"

    You can use [Node Version Manager](https://nodejs.org/en/download/package-manager#nvm) to install multiple Node.js versions and switch versions between projects.

### 3. Yarn 1 (Classic)
To verify your Yarn installation:

```sh
yarn --version
```

If your Yarn version starts with `1` (e.g. `1.22.22`) you're good to go.

If Yarn isn't installed, install [Yarn 1 (Classic)](https://classic.yarnpkg.com/en/docs/install#mac-stable).

If your Yarn version is `2.0` or greater, run the following from your Browsertrix project directory to enable Yarn 1:


```sh
cd frontend
corepack enable
corepack install
```

Check out the full [Yarn + Corepack installation guide](https://yarnpkg.com/corepack) for more details.


## Quickstart

From the command line, change your current working directory to `/frontend`:

```sh
cd frontend
```

!!! note

    From this point on, all commands in this guide should be run from the `frontend` directory.

Install UI dependencies:

```sh
yarn install
```

Copy environment variables from the sample file:

```sh
cp sample.env.local .env.local
```

Update `API_BASE_URL` in `.env.local` to point to your backend API URL noted earlier. For example, if connecting to your local deployment cluster:

```
API_BASE_URL=http://localhost:30870
```

??? info "Port when using Minikube (on macOS)"

    When using Minikube on macOS, the port will not be 30870. Instead, Minikube opens a tunnel to a random port,
    obtained by running `minikube service browsertrix-cloud-frontend --url` in a separate terminal.

    Set API_BASE_URL to provided URL instead, eg. `API_BASE_URL=http://127.0.0.1:<TUNNEL_PORT>`

!!! note

    This setup assumes that your API endpoints are available under `/api`, which is the default configuration for the Browsertrix backend.

Start the frontend development server:

```sh
yarn start
```

This will open `localhost:9870` in a new tab in your default browser.

Saving changes to files in `src` will automatically reload your browser window with the latest UI updates.

To stop the development server type ++ctrl+c++ into your command line terminal.

## Scripts

| `yarn <name>`      |                                                                 |
| ------------------ | --------------------------------------------------------------- |
| `start`            | runs app in development server, reloading on file changes       |
| `test`             | runs tests in chromium with playwright                          |
| `build-dev`        | bundles app and outputs it in `dist` directory                  |
| `build`            | bundles app, optimized for production, and outputs it to `dist` |
| `lint`             | find and fix auto-fixable javascript errors                     |
| `format`           | formats js, html, and css files                                 |
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

## Logging

Calls to `console.log()` and `console.debug()` are discarded by default in production, as configured in `frontend/webpack.prod.js`.
