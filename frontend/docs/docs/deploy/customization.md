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
```

This can be extended with additional channels. For example, here is what the value would look like adding a new x.y.z release of Browsertrix Crawler with the id `testing`:

```yaml
crawler_channels:
  - id: default
    image: "docker.io/webrecorder/browsertrix-crawler:latest"
  - id: testing
    image: "docker.io/webrecorder/browsertrix-crawler:x.y.z"
```

## Storage

The `storage` setting is used to specify primary and replica storage for a Browsertrix deployment. All configured storage options must be S3-compatible buckets. At minimum, there must be one configured storage option, as can be seen in the default configuration:

```yaml
storages:
  - name: "default"
    type: "s3"
    access_key: "ADMIN"
    secret_key: "PASSW0RD"
    bucket_name: *local_bucket_name

    endpoint_url: "http://local-minio.default:9000/"
```

It is possible to add one or more replica storage locations. If replica locations are enabled, all stored content in the application will be automatically replicated to each configured replica storage location in background jobs after being stored in the default primary storage. If replica locations are enabled, at least one must be set as the default replica location for primary backups. This is indicated with `is_default_replica: True`. If more than one storage location is configured, the primary storage must also be indicated with `is_default_primary: True`.

For example, here is what a storage configuration with two replica locations, one in another bucket on the same Minio S3 service as primary storage as well as another in an external S3 provider:

```yaml
storages:
  - name: "default"
    type: "s3"
    access_key: "ADMIN"
    secret_key: "PASSW0RD"
    bucket_name: *local_bucket_name

    endpoint_url: "http://local-minio.default:9000/"
    is_default_primary: True

  - name: "replica-0"
    type: "s3"
    access_key: "ADMIN"
    secret_key: "PASSW0RD"
    bucket_name: "replica-0"

    endpoint_url: "http://local-minio.default:9000/"
    is_default_replica: True
  
  - name: "replica-1"
    type: "s3"
    access_key: "accesskey"
    secret_key: "secret"
    bucket_name: "replica-1"

    endpoint_url: "http://s3provider.example.com"
```

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
