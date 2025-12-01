# Configuring Proxies

Browsertrix can be configured to direct crawling traffic through dedicated proxy servers, allowing websites to be crawled from a specific geographic location regardless of where Browsertrix itself is deployed.

The Browsertrix superadmin can configure which proxy servers are available to which organizations or if they are shared across all organizations, and users can [choose from one of the available proxies in each crawl workflow](../user-guide/workflow-setup.md#crawler-proxy-server). Users can also configure the default crawling proxy that will be used for the organization in organization-wide [Crawling Defaults](../user-guide/org-settings.md#crawling-defaults).

This guide covers how to set up proxy servers for use with Browsertrix, as well as how to configure Browsertrix to make those proxies available to organizations.

## Proxy Configuration

Browsertrix supports crawling through HTTP and SOCKS5 proxies, including through a SOCKS5 proxy over an SSH tunnel. For more information on what is supported in the underlying Browsertrix Crawler, see the [Browsertrix Crawler documentation](https://crawler.docs.browsertrix.com/user-guide/proxies/).

### Obtain an SSH Key-pair

To set up a proxy server to use with Browsertrix as SOCKS5 over SSH, you will need an SSH public key-pair and:

- The SSH public key configured on the remote machine
- The SSH private key configured in Browsertrix
- The public host key of the remote machine configured in Browsertrix (optional)

We recommend creating a dedicated SSH key-pair for use with Browsertrix, as well as a dedicated user, e.g. `proxy-user`, and not reusing existing keys or users.

For basic information on how to create a key-pair using `ssh-keygen`, see existing guides such as [this one from DigitalOcean](https://www.digitalocean.com/community/tutorials/how-to-configure-ssh-key-based-authentication-on-a-linux-server) or [this one from ssh.com](https://www.ssh.com/academy/ssh/keygen). We recommend an ECDSA key-pair.

We recommend securing the SSH connection for the proxy user to contain the following settings. This can be done by adding a file such as `/etc/ssh/sshd_config.d/99-ssh-proxy.conf` where `proxy-user` is the user connecting to the machine.

```
Match User proxy-user
    AllowTcpForwarding yes
    X11Forwarding no
    AllowAgentForwarding no
    ForceCommand /bin/false
    PubkeyAuthentication yes
    PasswordAuthentication no
```

## Browsertrix Configuration

Proxies are configured in Browsertrix through a separate subchart, and can be configured in the `btrix-proxies` section of the main Helm chart (or local override file) for the Browsertrix deployment. Alternatively, they can be [configured as a separate subchart](#deploying-with-proxies-via-subchart).

The proxy configuration will look like this, containing one or more proxy declarations.

```yaml
#default_proxy: <set for default proxy>

btrix-proxies:
  enabled: true
  proxies:
    - id: proxy-id-1
      shared: true
      label: My Proxy
      description: Proxy hosted in for Browsertrix
      country_code: US
      url: ssh://proxy-user@ssh-proxy-host
      ssh_host_public_key: <host public key>
      ssh_private_key: <private key>

    - id: proxy-id-2
      shared: false
      label: My SOCKS5 proxy
      country_code: DE
      url: socks5://username:password@proxy-host
      ...
```

First, set `enabled` to `true` to enable proxies.

Next, provide the details of each proxy server that you want to make available in the `proxies` list. Minimally, the `id`, `url` connection string, `label` name, and two-letter `country_code` must be set for each proxy.

### SSH Proxies

For SSH proxy servers,The `url` should be of the form `ssh://proxy-user@ssh-proxy-host`.  

The `ssh_private_key` is required and is the private key of the key-pair created above.

The `ssh_host_public_key` is recommended to help ensure a secure connection and can often be obtained by running: `ssh-keyscan dev.proxy-host -p 22` on the remote machine, assuming default SSH setup and hostname of `proxy-host`.

Only key-based auth is supported for SSH proxies, password-based authentication is not supported.

### SOCKS5 Proxies

For SOCKS5 proxies, the `url` should be of the form `socks5://username:password@socks-proxy-host`.

This method is to be used with dedicated SOCKS5 proxies (not over SSH), such as existing services that provide this feature.

### Shared Proxies

The `shared` field on each proxy object defines if this proxy should be accessible to all organizations in a Browsertrix deployment that are allowed to access shared proxy. If false, the proxy must be added directly to each organization that will have access to the proxy.

The proxy settings can be be configured in the super-admin UI by clicking the _Edit Proxies_ dropdown option in the actions menu for each organization.

### Default Proxy

The `default_proxy` field in the root of the Helm values file can optionally be set to the `id` for one of the available proxies list. If set, the default proxy will be used for all crawls that do not have an alternate proxy set in the workflow configuration. This can be useful if Browsertrix is deployed on a private network and requires a proxy to access the outside world.

This is a deployment-wide setting and is not shown to users, and is designed for admins to route all traffic through a designated proxy. Browsertrix will fail to start if the default proxy is not listed in the available proxies.

## Deployment

If `btrix-proxies` have been set in the main Helm chart or a local override file for your Browsertrix deployment, proxies will be enabled on next deploy of the Browsertrix helm chart. For instance, if the proxy configuration is located in a local override file `local.yaml`, you can use the following Helm command to redeploy Browsertrix with the proxy configuration:

```sh
helm upgrade --install -f ./chart/values.yaml -f ./chart/local.yaml btrix ./chart/
```

### Deploying with Proxies via subchart

Proxies can alternatively be configured with a separate proxies subchart.

This allows proxies to be updated without having to redeploy all of Browsertrix.

A separate proxies YAML file should contain just the `proxies` key:

```yaml
proxies:
  - id: proxy-id-1
    shared: true
    label: My Proxy
    description: Proxy hosted in for Browsertrix
    country_code: US
    url: ssh://proxy-user@ssh-proxy-host
    ssh_host_public_key: <host public key>
    ssh_private_key: <private key>

  - id: proxy-id-2
    shared: false
    label: My SOCKS5 proxy
    country_code: DE
    url: socks5://username:password@proxy-host
```

If the above YAML is placed in `proxies.yaml`, the subchart can be deployed with the following command and Browsertrix will pick up the updated proxies:

```sh
helm upgrade --install -f ./chart/proxies.yaml proxies ./chart/proxies/
```

### GitHub Release for subchart

The above layout assumes a local copy of the Browsertrix repo.

The proxies subchart can also be deployed from the latest GitHub release via:

```sh
helm upgrade --install proxies https://github.com/webrecorder/browsertrix/releases/download/RELEASE/btrix-proxies-VERSION.tgz
```

where `RELEASE` is the Browsertrix release and `VERSION` is the version of the proxies chart.

See the [Browsertrix releases page](https://github.com/webrecorder/browsertrix/releases) for the latest available versions.
