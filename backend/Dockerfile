FROM ghcr.io/astral-sh/uv:python3.12-trixie-slim AS builder
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

ENV UV_NO_DEV=1
ENV UV_PYTHON_DOWNLOADS=0

WORKDIR /app
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project
COPY pyproject.toml /app
COPY uv.lock /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked

FROM docker.io/library/python:3.12-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends git \
	&& apt-get purge -y --auto-remove \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

ADD pyproject.toml /app
ADD uv.lock /app

COPY --from=builder --chown=nonroot:nonroot /app /app

ADD btrixcloud/ /app/btrixcloud/

ENV PATH="/app/.venv/bin:$PATH"

ARG GIT_COMMIT_HASH
ARG GIT_BRANCH_NAME

ENV GIT_COMMIT_HASH=${GIT_COMMIT_HASH}
ENV GIT_BRANCH_NAME=${GIT_BRANCH_NAME}

EXPOSE 8000
