# Developing Email Templates

The email templating engine is built using [React Email](https://react.email/). It includes a set of components and utilities for building email templates, as well as a tool for viewing and testing emails locally.

To view and edit email templates, you can run the React Email development server:

```sh
cd emails
```
```sh
yarn install
```
```sh
yarn dev
```

You can then view the email templates in your browser at [localhost:3000](http://localhost:3000).

Templates themselves are located in the `emails` directory.

## Testing Email Sending

Email sending can be tested locally with a tool such as [smtp4dev](https://github.com/rnwood/smtp4dev).

If you have previously deployed the Browsertrix backend, you'll need to make some changes to your `chart/local.yaml`:

1. Update your `chart/local.yaml` to include the new service:
  ```yaml hl_lines="3 8"
  # use version specified in values.yaml, uncomment to use :latest release instead
  backend_image: docker.io/webrecorder/browsertrix-backend:latest
  emails_image: docker.io/webrecorder/browsertrix-emails:latest
  frontend_image: docker.io/webrecorder/browsertrix-frontend:latest

  # overrides to use existing images in local Docker, otherwise will pull from repository
  backend_pull_policy: "Never"
  emails_pull_policy: "Never"
  frontend_pull_policy: "Never"
  ```
2. If you'd like to view emails in a service such as [smtp4dev](https://github.com/rnwood/smtp4dev) locally (see [Using smtp4dev](#using-smtp4dev)), rather than just viewing emails in pod logs, update your `chart/local.yaml` to include email sending options:
  ```yaml hl_lines="1-7"
  email:
    smtp_host: "host.docker.internal"
    smtp_port: 2525
    sender_email: example@example.com
    password: password
    reply_to_email: example@example.com
    use_tls: false
  ```
3. Build the updated backend and new emails images:
  ```sh
  ./scripts/build-backend.sh
  ```
  ```sh
  ./scripts/build-emails.sh
  ```
4. Deploy the changes you've made:
  ```sh
  helm upgrade --install -f ./chart/values.yaml -f ./chart/local.yaml btrix ./chart/
  ```

### Using smtp4dev

If you're using Docker Desktop or a similar Docker-compatible Kubernetes runtime (e.g. OrbStack), you can use a command such as this to start up smtp4dev:
```sh
docker run --rm -it -p 5000:80 -p 2525:25 rnwood/smtp4dev
```

After a few seconds, you can then open [localhost:3000](http://localhost:3000).

If you're using a different Kubernetes runtime (e.g. k3d, microk8s, etc) you may need to set `smtp_host` to something other than `host.docker.internal` in your `chart/local.yaml`, and you may also need to configure other options. k3d likely uses `host.k3d.internal`, and microk8s `10.0.1.1`, but double check with your Kubernetes runtime documentation.
