# syntax=docker/dockerfile:1.4
ARG RWP_BASE_URL=https://cdn.jsdelivr.net/npm/replaywebpage/
ARG YARN_BUILD_DEPS=build_deps

FROM docker.io/library/node:16 as build_deps

WORKDIR /app
COPY yarn.lock package.json ./
# Uses `yarn cache clean` to let Docker cache layer instead
# of including yarn cache in the build image
RUN yarn --production --frozen-lockfile --ignore-optional --network-timeout 1000000 && \
    yarn cache clean

COPY --link lit-localize.json \
    postcss.config.js \
    tailwind.config.js \
    tsconfig.json \
    webpack.config.js \
    webpack.prod.js \
    index.d.ts \
    ./

COPY --link src ./src/

RUN yarn build

ARG YARN_BUILD_DEPS
FROM --platform=linux/amd64 ${YARN_BUILD_DEPS} as build

# Build variables used to show current app version
# in the UI. Note that this will invalidate all
# subsequent RUN steps.
ARG GIT_COMMIT_HASH
ARG GIT_BRANCH_NAME
ARG VERSION
ARG RWP_BASE_URL

ENV GIT_COMMIT_HASH=${GIT_COMMIT_HASH} \
    GIT_BRANCH_NAME=${GIT_BRANCH_NAME} \
    VERSION=${VERSION} \
    RWP_BASE_URL=${RWP_BASE_URL}

FROM docker.io/library/nginx:1.23.2

ARG RWP_BASE_URL
ENV RWP_BASE_URL=${RWP_BASE_URL}

COPY --link --from=build /app/dist /usr/share/nginx/html

#COPY ./nginx.conf /etc/nginx/nginx.conf
COPY --link ./frontend.conf.template /etc/nginx/templates/
COPY --link ./minio.conf /etc/nginx/includes/

ADD --link ./00-browsertrix-nginx-init.sh ./docker-entrypoint.d/

