# Customizing Browsertrix Deployment

Local and production deployments alike can be customized by modifying the `chart/values.yaml` Helm chart file or a local override. For more on using local overrides, see the [Local Deployment Guide](local.md). The remainder of this guide covers some of the customization options available in the Helm chart.

## Default Organization

The `default_org` setting is used to specify the name for the default organization created in a Browsertrix deployment. A slug will be auto-generated based on this value and can be modified in [Org Settings](../user-guide/org-settings.md) within the application.

## Superuser

The `superuser` setting is used to set the username and password for a deployment's superuser. If `password` is left blank, the application will auto-generate a secure password for the superuser.

## Crawler Channels

The `crawler_channels` setting is used to specify the [_Crawler Release Channel_](../user-guide/workflow-setup.md#crawler-release-channel) option available to users via dropdown menus in workflows and browser profiles. Each crawler channel has an id and a Docker image tag. These channels are modifiable with the restriction that there must always be one channel with the id `default`. By default this is the only channel available on deployments:

```yaml
crawler_channels:
  - id: default
    image: "docker.io/webrecorder/browsertrix-crawler:latest"
    imagePullPolicy: Always # optional
```

This can be extended with additional channels. For example, here is what the value would look like adding a new x.y.z release of Browsertrix Crawler with the id `testing`:

```yaml
crawler_channels:
  - id: default
    image: "docker.io/webrecorder/browsertrix-crawler:latest"
  - id: testing
    image: "docker.io/webrecorder/browsertrix-crawler:x.y.z"
    imagePullPolicy: IfNotPresent
```

The `imagePullPolicy` per channel is optional. If not set, the value set in `crawler_pull_policy` is used as the default.

## Storage

The `storage` setting is used to specify primary and replica storage for a Browsertrix deployment. All configured storage options must be S3-compatible buckets. At minimum, there must be one configured storage option, which includes a `is_default_primary: true`.

### Using Local Minio Storage

Browsertrix includes a built-in Minio storage service, which is enabled by default (`minio_local: true` is set).

The configuration for this is as follows:


```yaml
storages:
  - name: "default"
    type: "s3"
    access_key: "ADMIN"
    secret_key: "PASSW0RD"
    bucket_name: btrix-data

    endpoint_url: "http://local-minio.default:9000/"
    access_endpoint_url: /data/
```

The `access_key` and `secret_key` should be changed, otherwise no additional changes are needed, and all local data will be stored in this Minio instance by default.

The S3 bucket is accessible via `/data/` path on the same host Browsertrix is running on, eg. `http://localhost:30870/data/`.


### Using External S3 Storage Providers

Browsertrix can also be used with external S3 storage providers, which can be configured as follows:

```yaml
storages:
  - name: default
    type: "s3"
    access_key: "accesskey"
    secret_key: "secret"

    endpoint_url: "https://s3provider.example.com/bucket/path/"
    access_endpoint_url: "https://my-custom-domain.example.com/path/" #optional
    is_default_primary: true
```


When using an external S3 provider, a custom `access_endpoint_url` can be provided, and the `bucket_name` need to be specified separately.
This URL is used for direct access to WACZ files, and can be used to specify a custom domain to access the bucket.

The `endpoint_url` should be provided in 'path prefix' form (with the bucket after the path), eg:
`https://s3provider.example.com/bucket/path/`.

Browsertrix will handle presigning S3 URLs so that WACZ files (and other data) can be accessed directly, using URLs of the form: `https://s3provider.example.com/bucket/path/to/files/crawl.wacz?signature...`

Since the local Minio service is not used, `minio_local: false` can be set to save resource in not deploying Minio.


### Custom Access Endpoint URL

It may be useful to provide a custom access endpoint for accessing WACZ files and other data. if the `access_endpoint_url` is provided,
it should be in 'virtual host' form (the bucket is not added to the path, but is assumed to be the in the host).

The host portion of the URL is then replaced with the `access_endpoint_url`. For example, given `endpoint_url: https://s3provider.example.com/bucket/path/` and `access_endpoint_url: https://my-custom-domain.example.com/path/`, a URL to a WACZ files in 'virtual host' form may be `https://bucket.s3provider.example.com/path/to/files/crawl.wacz?signature...`.

The `https://bucket.s3provider.example.com/path/` is then replaced with the `https://my-custom-domain.example.com/path/`, and the final URL becomes `https://my-custom-domain.example.com/path/to/files/crawl.wacz?signature...`.


### Storage Replicas

It is possible to add one or more replica storage locations. If replica locations are enabled, all stored content in the application will be automatically replicated to each configured replica storage location in background jobs after being stored in the default primary storage. If replica locations are enabled, at least one must be set as the default replica location for primary backups. This is indicated with `is_default_replica: true`. If more than one storage location is configured, the primary storage must also be indicated with `is_default_primary: true`.

For example, here is what a storage configuration with two replica locations, one in another bucket on the same local Minio S3 service as primary storage as well as another in an external S3 provider:

```yaml
storages:
  - name: "default"
    type: "s3"
    access_key: "ADMIN"
    secret_key: "PASSW0RD"
    bucket_name: btrix-data
    access_endpoint_url: /data/

    endpoint_url: "http://local-minio.default:9000/"
    is_default_primary: true

  - name: "replica-0"
    type: "s3"
    access_key: "ADMIN"
    secret_key: "PASSW0RD"
    bucket_name: "replica-0"

    endpoint_url: "http://local-minio.default:9000/"
    is_default_replica: true

  - name: "replica-1"
    type: "s3"
    access_key: "accesskey"
    secret_key: "secret"
    bucket_name: "replica-1"

    endpoint_url: "https://s3provider.example.com/bucket/path/"
    access_endpoint_url: "https://my-custom-domain.example.com/path/"
```

When replica locations are set, the default behavior when a crawl, upload, or browser profile is deleted is that the replica files are deleted at the same time as the file in primary storage. To delay deletion of replicas, set `replica_deletion_delay_days` in the Helm chart to the number of days by which to delay replica file deletion. This feature gives Browsertrix administrators time in the event of files being deleted accidentally or maliciously to recover copies from configured replica locations.

## Crawler Resources and Auto-Resizing (Vertical Pod Autoscaling) of Crawlers

Browsertrix provides a number of settings for controlling the memory and cpu allocated to each crawler.

The minimum requirements (k8s resources requests) are set based on the number of browser worker instances per crawler,
(`crawler_browser_instances`).

The maximum limits (k8s resource limits) are optionally set as well for memory, and can be set to the same as requests,
for memory, or unset for cpu, as per one recommended best practice.

### Crawler Pod Autoscaling

Optionally, it is possible to use the Vertical Pod Autoscaler to automatically adjust the minimum while the crawl is running.

In this case, the max limits, `max_crawler_memory` and `max_crawler_cpu` should be set to ensure crawler pods don't scale
above available memory and cpu.

To enable the VPA:

1) Install the Vertical Pod Autoscaler components, either [from the official GitHub](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler#installation) or from [an known helm chart](https://artifacthub.io/packages/helm/cowboysysop/vertical-pod-autoscaler)

2) Set `enable_crawlers_auto_size` to true.
3) Also set `max_crawler_memory` and `max_crawler_cpu` (recommended). Be sure not to exceed the max memory and cpu available on the nodes the pods will be running on.


## Horizontal Autoscaling of Browsertrix App Pods

Browsertrix also includes support for horizontal auto-scaling for both the backend and frontend pods.
The auto-scaling will start a new pod when memory/cpu utilization reaches the thresholds.

To use auto-scaling, the [metrics-server](https://github.com/kubernetes-sigs/metrics-server) cluster add-on is required.
Many k8s provides include metrics server by default, others, like MicroK8S, make it available as an add-on.

To enable auto-scaling, set `backend_max_replicas` and/or `frontend_max_replicas` to a value >1.

```yaml
backend_max_replicas: 2

frontend_max_replicas: 2
```

By default, the auto-scaling uses the following thresholds for deciding when to start a new pod can also
be modified. The default values are:

```yaml
backend_avg_cpu_threshold: 80

backend_avg_memory_threshold: 95

frontend_avg_cpu_threshold: 80

frontend_avg_memory_threshold: 95
```

## Email / SMTP Server

Browsertrix sends user invitations, password resets, background job failure notifications, and other important messages via email. The `email` setting can be used to configure the SMTP server used to send emails. To avoid email messages from Browsertrix being flagged as spam, be sure to use the same domain for `sender_email` and `reply_to_email`.


### Customizing Email Templates

It is also possible to custom the HTML/plain-text email templates that Browsertrix sends out with a custom `--set-file` parameter for `email.templates.<TEMPLATE_NAME>` pointing to an alternate template file. For example, to use a custom `invite.html` for the invite template, add:

```shell
helm upgrade --install btrix ... --set-file email.templates.invite=./invite.html
```

The list of available templates (and their default content) [is available here](https://github.com/webrecorder/browsertrix/tree/main/chart/email-templates)

The format of the template file is, for HTML emails:

```
Subject
~~~
HTML Content
~~~
Text Content
```

or, for plain text emails:

```
Subject
~~~
Text
```

The `~~~` is used to separate the sections. If only two sections are provided, the email template is treated as plain text, if three, an HTML email with plain text fallback is sent.

## Signing WACZ Files

Browsertrix has the ability to cryptographically sign WACZ files with [Authsign](https://github.com/webrecorder/authsign). The ``signer`` setting can be used to enable this feature and configure Authsign.

## Enable Open Registration

You can enable sign-ups by setting `registration_enabled` to `"1"`. Once enabled, your users can register by visiting `/sign-up`.

## Inject Extra JavaScript

You can add a script to inject analytics, bug reporting tools, etc. into the frontend by setting `inject_extra` to script contents of your choosing. If present, it will be injected as a blocking script tag that runs when the frontend web app is initialized.

For example, enabling analytics and tracking might look like this:

```yaml
inject_extra: >
  const analytics = document.createElement("script");
  analytics.src = "https://cdn.example.com/analytics.js";
  analytics.defer = true;

  document.head.appendChild(analytics);

  window.analytics = window.analytics
    || function () { (window.analytics.q = window.analytics.q || []).push(arguments); };
```

Note that the script will only run when the web app loads, i.e. the first time the app is loaded in the browser and on hard refresh. The script will not run again upon clicking a link in the web app. This shouldn't be an issue with most analytics libraries, which should listen for changes to [window history](https://developer.mozilla.org/en-US/docs/Web/API/History). If you have a custom script that needs to re-run when the frontend URL changes, you'll need to add an event listener for the [`popstate` event](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event).

### Tracking events

Certain anonymized user interactions—such as public collection views, downloads, and shares—can be tracked for the purpose of collecting and analyzing metrics. To enable tracking these events, set `window.btrixEvent` in your `inject_extra` config to your custom track call. This should be a JavaScript function that conforms to the following type:

```ts
type btrixEvent = (
  event: string,
  extra?: {
    props?: {
      org_slug: string | null;
      collection_slug?: string | null;
      logged_in?: boolean;
    };
  },
) => void;
```

Tracking is optional and will never expose personally identifiable information.
