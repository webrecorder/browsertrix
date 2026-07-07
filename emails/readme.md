# Browsertrix Email Templates

A collection of React Email templates for Browsertrix with a live preview in your browser (via React Email) and an API server for rendering templates programmatically.

## Getting Started

First, install the dependencies:

```sh
yarn
```

Then, run the development server:

```sh
yarn dev
```

Open [localhost:3000](http://localhost:3000) with your browser to see the templates.

## API Server

This project includes an Express API server that can render the email templates and serve them as HTML. This makes it easy to integrate with email sending services like SendGrid, Mailgun, or AWS SES.

To start the API server:

```sh
yarn start
```

The API server will be available at [localhost:3000](http://localhost:3000).

## Development notes

We've decided to hold back on React Email's recommended move from `@react-email/components` to `react-email` for components and render functions because it's currently not possible to only import the relevant components from `react-email`, meaning that Docker build times & image sizes are _significantly_ longer. This seems to be a known issue (https://github.com/resend/react-email/issues/3556), so fingers crossed they'll resolve this in the future and we'll be able to switch off of the now-deprecated `@react-email/components` package.

The `react-email` and `@react-email/ui` packages are kept in `optionalDependencies` so that local development (`yarn dev`) still works, but they're skipped in Docker builds with `--ignore-optional`.
