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
yarn start:api
```

The API server will be available at [localhost:3000](http://localhost:3000).
