# central place to configure the production replayweb.page loading prefix
ARG RWP_BASE_URL=https://cdn.jsdelivr.net/npm/replaywebpage@1.5.8/

FROM node:16 as build

ARG GIT_COMMIT_HASH
ARG GIT_BRANCH_NAME

ENV GIT_COMMIT_HASH=${GIT_COMMIT_HASH} \
    GIT_BRANCH_NAME=${GIT_BRANCH_NAME}


WORKDIR /app
COPY yarn.lock package.json ./
RUN yarn --frozen-lockfile

COPY lit-localize.json \
     postcss.config.js \
     tailwind.config.js \
     tsconfig.json \
     webpack.config.js \
     webpack.prod.js \
     ./

COPY src ./src/

RUN yarn build

FROM nginx

ARG RWP_BASE_URL
ENV RWP_BASE_URL=${RWP_BASE_URL}

COPY --from=build /app/dist /usr/share/nginx/html

COPY ./nginx.conf /etc/nginx/nginx.conf
COPY ./frontend.conf.template /etc/nginx/templates/
COPY ./minio.conf /etc/nginx/includes/

ADD ./00-default-override-resolver-config.sh ./docker-entrypoint.d/

