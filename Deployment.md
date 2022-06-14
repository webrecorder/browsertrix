# Deploying Browsertrix Cloud

Browsertrix Cloud can be deployed anywhere from single-node isolated environments, multi-machine setups and cloud-native Kubernetes!

Browsertrix Cloud currently supports three deployment methods:
- Rootless deployment with podman on a single-machine (no Docker required)
- Docker Swarm for single or multi-machine deployments
- Kubernetes Cluster deployment.

Some basic instructions are provided below, we plan to expand this into more detail tutorial in the future.

(All shell scripts can be found in the `./scripts` directory)

## Deploying with Docker Swarm

For local deployments, using Docker Swarm is recommended. Docker Swarm can be used in a single-machine mode as well
as with multi-machine setups. Docker Swarm is part of Docker, so if you have Docker installed, you can use this method.

1. Run the `init-configs.sh` which will copy the sample configs to `configs/config.env` and `configs/config.yaml`.

2. You can edit `configs/config.env` and `configs/config.yaml` to set default passwords for superadmin, minio and mongodb.

3. Run `run-swarm.sh` to initialize the cluster.

4. Load `http://localhost:9871/` to see the Browsertrix Cloud login page. (The API is also available at: `http://localhost:9871/api/docs`).

You can stop the deployment with `stop-swarm.sh` and restart again with `run-swarm.sh`


Note: Currently, unless email settings are configured, you will need to look at the logs to get the invite code for invites. You can do this by running:
`docker service logs btrix_backend`


## Deploying with Podman

Browsertrix Cloud can now also be used with Podman for environments that don't support Docker.

Podman allows Browsertrix Cloud to be deployed locally by a non-root user.

Podman deployment also requires either docker-compose or podman-compose.


### Initial Installation

To run with Podman as a non-root user, there's a few initial installation

1. Ensure the podman service over a socket is running with: `systemctl --user start podman.socket`. Podman does not require a service, but Browsertrix Cloud requires access to the socket to worker.

2. Ensure podman [can set cpu limits](https://github.com/containers/podman/blob/main/troubleshooting.md#26-running-containers-with-cpu-limits-fails-with-a-permissions-error) as Browsertrix Cloud uses cpu and memory limits for each crawl. After following instructions above, also run `sudo systemctl daemon-reload` to reload the delegate settings.

3. Ensure podman-compose is installed via `pip install podman-compose`.

4. Run `build-podman.sh` to build the local images.

5. Run the `init-configs.sh` which will copy the sample configs to `configs/config.env` and `configs/config.yaml`.

6. You can edit `configs/config.env` and `configs/config.yaml` to set default passwords for superadmin, minio and mongodb.

7. Run `run-podman.sh` to run Browsertrix Cloud using podman.

8. Load `http://localhost:9871/` to see the Browsertrix Cloud login page. (The API is also available at: `http://localhost:9871/api/docs`).


You can stop the deployment with `stop-podman.sh` and restart again with `run-podman.sh`

Note: Currently, unless email settings are configured, you will need to look at the logs to get the invite code for invites. You can do this by running:
`podman logs -f browsertrix-cloud_backend_1`

It's also possible to use Docker Compose with podman by setting `export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock`. You can change the setting
in `run-podman.sh` and `stop-podman.sh` to use docker-compose instead if desired.


### Enabling Signing (for Swarm and Podman Deployments)

Browsertrix Cloud can optionally sign WACZ files with the same key used to generate an SSL cert.

To use this functionality, the machine running Browsertrix Cloud must be associated with a domain and must have port 80 available on that domain,
or another port forwarding to port 80.

The `docker-compose.signing.yml` adds the capability for signing with the `authsign` module.

To enable signing in the Docker-based deployment:

1. Copy `configs/signing.sample.yaml` to `configs/signing.yaml` and set the domain and email fields in the config. Set `staging` to false to generate real certificates.

2. In `docker-compose.signing.yaml`, set an optional signing token.

3. In `run-swarm.sh`, uncomment the option for running with signing.




## Deploying to Kubernetes

For deploying in the cloud, the Kubernetes (k8s) deployment is recommended.
Browsertrix Cloud uses `helm` to deploy to K8s.


1. Ensure `helm` is installed locally and `kubectl` is configured for your k8s cluster.

2. Edit `chart/values.yaml` to configure your deployment. The `ingress` section contains the domain the service will be deployed in, and `signing` can be used to enable WACZ signing.

3. Run: `helm upgrade --install -f ./chart/values.yaml btrix ./chart/` to deploy or upgrade an existing deployment.


To stop, run `helm uninstall btrix`.

*Additional info coming soon*
