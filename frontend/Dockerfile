# central place to configure the production replayweb.page loading prefix
ARG RWP_BASE_URL=https://cdn.jsdelivr.net/npm/replaywebpage/

FROM docker.io/library/node:16 as build

ARG GIT_COMMIT_HASH
ARG GIT_BRANCH_NAME
ARG VERSION

ENV GIT_COMMIT_HASH=${GIT_COMMIT_HASH} \
    GIT_BRANCH_NAME=${GIT_BRANCH_NAME} \
    VERSION=${VERSION}


WORKDIR /app
COPY yarn.lock package.json ./
RUN yarn --frozen-lockfile

COPY lit-localize.json \
    postcss.config.js \
    tailwind.config.js \
    tsconfig.json \
    webpack.config.js \
    webpack.prod.js \
    index.d.ts \
    ./

COPY src ./src/

RUN yarn build

FROM docker.io/library/nginx:1.23.2

ARG RWP_BASE_URL
ENV RWP_BASE_URL=${RWP_BASE_URL}

COPY --from=build /app/dist /usr/share/nginx/html

#COPY ./nginx.conf /etc/nginx/nginx.conf
COPY ./frontend.conf.template /etc/nginx/templates/
COPY ./minio.conf /etc/nginx/includes/

ADD ./00-browsertrix-nginx-init.sh ./docker-entrypoint.d/

