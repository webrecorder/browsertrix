# Must be run from the root of the repository, e.g. docker build -f frontend/Dockerfile -t frontend

# syntax=docker/dockerfile:1.4
FROM --platform=$BUILDPLATFORM docker.io/library/node:22 as build_deps

WORKDIR /app
COPY .yarnrc yarn.lock package.json ./
COPY frontend/package.json ./frontend/
# Uses a cache mount for the Yarn cache so that it's not included in subsequent steps
RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn --production --frozen-lockfile --ignore-optional --network-timeout 1000000

COPY --link frontend/config ./frontend/config/
COPY --link frontend/lit-localize.json \
    frontend/postcss.config.js \
    frontend/tailwind.config.js \
    frontend/tsconfig.json \
    frontend/webpack.config.js \
    frontend/webpack.prod.js \
    frontend/.eslintrc.js \
    frontend/tsconfig.eslint.json \
    frontend/index.d.ts \
    ./frontend/

COPY --link frontend/lib ./frontend/lib/
COPY --link frontend/src ./frontend/src/

# Build variables used to show current app version
# in the UI. Note that this will invalidate all
# subsequent RUN steps.
ARG GIT_COMMIT_HASH
ARG GIT_BRANCH_NAME
ARG VERSION

ENV GIT_COMMIT_HASH=${GIT_COMMIT_HASH} \
    GIT_BRANCH_NAME=${GIT_BRANCH_NAME} \
    VERSION=${VERSION}

RUN yarn workspace browsertrix-frontend build

# Prevent Docker image including node_modules to save space
RUN rm -rf ./node_modules

FROM --platform=$BUILDPLATFORM docker.io/library/python:3.12-slim as build_docs

WORKDIR /docs

RUN pip install mkdocs-material mkdocs-redirects

COPY --link ./frontend/docs/mkdocs.yml .
COPY --link ./frontend/docs/docs ./docs

RUN API_DOCS_URL=/api/redoc mkdocs build

FROM docker.io/library/nginx:1.23.2

COPY --link --from=build_deps /app/frontend/dist /usr/share/nginx/html

COPY --link --from=build_docs /docs/site /usr/share/nginx/html/docs

#COPY ./frontend/nginx.conf /etc/nginx/nginx.conf
COPY --link ./frontend/frontend.conf.template /etc/nginx/templates/
COPY --link ./frontend/minio.conf /etc/nginx/includes/

ADD --link ./frontend/00-browsertrix-nginx-init.sh ./docker-entrypoint.d/
