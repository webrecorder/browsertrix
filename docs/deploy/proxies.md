# Configuring Proxies

Browsertrix can be configured to direct crawling traffic through dedicated proxy servers, so that websites can be crawled from a specific geographic location regardless of where Browsertrix itself is deployed.

This guide covers how to set up proxy servers for use with Browsertrix, as well as how to configure Browsertrix to make those proxies available.

## Proxy Configuration

Browsertrix supports crawling through HTTP and SOCKS5 proxies, including through a SOCKS5 proxy over an SSH tunnel. For more information on what is supported in the underlying Browsertrix Crawler, see the [Browsertrix Crawler documentation](https://crawler.docs.browsertrix.com/user-guide/proxies/).

Many commercial proxy services exist. If you are planning to use commercially-provided proxies, continue to [Browsertrix Configuration](#browsertrix-configuration) below.

To set up your own proxy server to use with Browsertrix as SOCKS5 over SSH, the first thing that is needed is a physical or virtual server that you intend to use as the proxy. For security purposes, we recommend creating a new user on this remote machine solely for proxy access.

Once the remote machine is ready and the new user created, add the public key of a public/private key pair (we recommend using a new ECDSA key pair) to the remote machine under the proxy user to allow. You will need to supply the corresponding private key to Browsertrix in [Browsertrix Configuration](#browsertrix-configuration) below.

Finally, modify the ssh configuration for the proxy user on the remote machine to secure the server and only allow public key authentication for this user. For instance:

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

Proxies are configured in Browsertrix through a separate subchart, and can be configured in the `btrix-proxies` section of the main Helm chart (or local override file) for the Browsertrix deployment, or in a separate values file that only contains proxy information, for example `proxies.yaml`.

First, set `enabled` to `true`, which will enable deploying proxy servers.

Next, provide the details of each proxy server that you want available within Browsertrix in the `proxies` list. Minimally, an id, connection string URL, label, and two-letter country code must be set for each proxy. If you want a particular proxy to be shared and potentially available to all organizations on a Browsertrix deployment, set `shared` to `true`. For SSH proxy servers, an `ssh_private_key` is required, and the contents of a known hosts file can additionally be provided to help secure a connection.

The `default_proxy` field can optionally be set to the id for one of the proxies in the `proxies` list. If set, the default proxy will be used for all crawls that do not have an alternate proxy set in the workflow configuration.

Once all proxy details are set, they are ready to be deployed.

If `btrix-proxies` have been set in the main Helm chart or a local override file for your Browsertrix deployment, deploy with the regular Helm upgrade command. For isntance, if the proxy configuration is located in a local override file `local.yaml`, you can use the following Helm command to redeploy Browsertrix with the proxy configuration:

```sh
helm upgrade --wait --install -f ./chart/values.yaml -f ./chart/local.yaml btrix ./chart/
```

If `btrix-proxies` have been set in a distinct value file, deploy changes from this file directly. This approach does not require redeploying the entire Browsertrix application to update the proxy configuration. For instance, if the proxy configuration is located in a file named `proxies.yaml`, you can use the following Helm command to deploy the proxy changes:

```sh
helm upgrade --wait --install -f ./chart/proxies.yaml proxies ./chart/proxies/
```

