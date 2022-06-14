ARG PODMAN_VERSION=remote

FROM docker.io/mgoltzsche/podman:${PODMAN_VERSION}-remote as podmanremote

FROM python:3.9

WORKDIR /app

ADD requirements.txt /app

RUN pip install -r requirements.txt

RUN python-on-whales download-cli

#RUN cd /tmp/; \
#    wget https://github.com/containers/podman/releases/download/v3.4.1/podman-remote-static.tar.gz; \
#    tar xvfz podman-remote-static.tar.gz; \
#    mv ./podman-remote-static /usr/bin/podman

ADD btrixcloud/ /app/btrixcloud/

COPY --from=podmanremote /usr/local/bin/podman-remote /usr/bin/podman

CMD uvicorn btrixcloud.main:app_root --host 0.0.0.0 --access-log --log-level info

