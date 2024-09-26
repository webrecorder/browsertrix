# Configuring Proxies

Browsertrix can be configured to direct crawling traffic through dedicated proxy servers, so that websites can be crawled from a specific geographic location regardless of where Browsertrix itself is deployed.

This guide covers how to set up proxy servers for use with Browsertrix, as well as how to configure Browsertrix to make those proxies available.

## Proxy Configuration

Browsertrix supports crawling through HTTP and SOCKS5 proxies, including through a SOCKS5 proxy over an SSH tunnel. For more information on what is supported in the underlying Browsertrix Crawler, see the [Browsertrix Crawler documentation](https://crawler.docs.browsertrix.com/user-guide/proxies/).

Many commercial proxy services exist. If you are planning to use commercially-provided proxies, continue to [Browsertrix Configuration](#browsertrix-configuration) below.

To set up your own proxy server to use with Browsertrix as SOCKS5 over SSH, the first thing that is needed is a physical or virtual server that you intend to use as the proxy. Once you have access to this remote machine, you will need to add the public key of a public/private key pair (we recommend using a new ECDSA key pair) to support ssh connections to the remote machine. You will need to supply the corresponding private key to Browsertrix in [Browsertrix Configuration](#browsertrix-configuration) below.

(TODO: More technical setup details as needed)

## Browsertrix Configuration

Proxies are configured in Browsertrix through a separate deployment and subchart. This enables easier updates to available proxy servers without needing to redeploy the entire Browsertrix application.

To add or update proxies to your Browsertrix Deployment, modify the `btrix-proxies` section of the main Helm chart or your local override.

First, set `enabled` to `true`, which will enable deploying proxy servers.

Next, provide the details of each proxy server that you want available within Browsertrix in the `proxies` list. Minimally, an id, connection string URL, label, and two-letter country code must be set for each proxy. If you want a particular proxy to be shared and potentially available to all organizations on a Browsertrix deployment, set `shared` to `true`. For SSH proxy servers, an `ssh_private_key` is required, and the contents of a known hosts file can additionally be provided to help secure a connection.

Once all proxy details are set, deploy the proxies by (TODO: add these details)
