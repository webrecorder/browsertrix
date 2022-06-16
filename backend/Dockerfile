ARG PODMAN_VERSION=4

FROM docker.io/mgoltzsche/podman:${PODMAN_VERSION}-remote as podmanremote

FROM python:3.9

WORKDIR /app

ADD requirements.txt /app

RUN pip install -r requirements.txt

RUN python-on-whales download-cli

ADD btrixcloud/ /app/btrixcloud/

COPY --from=podmanremote /usr/local/bin/podman-remote /usr/bin/podman

CMD uvicorn btrixcloud.main:app_root --host 0.0.0.0 --access-log --log-level info

EXPOSE 8000
