FROM docker.io/library/python:3.12-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends git \
	&& apt-get purge -y --auto-remove \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

ADD requirements.txt /app

RUN pip install -r requirements.txt

ADD btrixcloud/ /app/btrixcloud/

ARG GIT_COMMIT_HASH
ARG GIT_BRANCH_NAME

ENV GIT_COMMIT_HASH=${GIT_COMMIT_HASH} \
    GIT_BRANCH_NAME=${GIT_BRANCH_NAME}

EXPOSE 8000
