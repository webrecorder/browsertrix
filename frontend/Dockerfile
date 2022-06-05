# central place to configure the production replayweb.page loading prefix
ARG RWP_BASE_URL=https://cdn.jsdelivr.net/npm/replaywebpage@1.5.8/

FROM node:16 as build

ARG GIT_COMMIT_HASH
ARG GIT_BRANCH_NAME

ENV GIT_COMMIT_HASH=${GIT_COMMIT_HASH} \
    GIT_BRANCH_NAME=${GIT_BRANCH_NAME}


WORKDIR /app
COPY yarn.lock package.json .
RUN yarn --frozen-lockfile

COPY lit-localize.json \
     postcss.config.js \
     tailwind.config.js \
     tsconfig.json \
     webpack.config.js \
     webpack.prod.js \
     .

COPY src ./src/

RUN yarn build

FROM nginx

ARG RWP_BASE_URL
ENV RWP_BASE_URL=${RWP_BASE_URL}

COPY --from=build /app/dist /usr/share/nginx/html

COPY ./nginx.conf /etc/nginx/nginx.conf
COPY ./frontend.conf.template /etc/nginx/templates/

# default docker resolver, overridden in k8s
RUN rm /etc/nginx/conf.d/*; \
    mkdir -p /etc/nginx/includes/; \
    mkdir -p /etc/nginx/resolvers; echo "resolver 127.0.0.11;" > /etc/nginx/resolvers/resolvers.conf
    #mkdir -p /etc/nginx/resolvers; echo "" > /etc/nginx/resolvers/resolvers.conf

COPY ./locations.conf /etc/nginx/includes/

EXPOSE 9781

