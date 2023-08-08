# syntax=docker/dockerfile:1.4
ARG RWP_BASE_URL=https://cdn.jsdelivr.net/npm/replaywebpage/

FROM docker.io/library/nginx:1.23.2

ARG GIT_COMMIT_HASH
ARG GIT_BRANCH_NAME
ARG VERSION

ENV GIT_COMMIT_HASH=${GIT_COMMIT_HASH} \
  GIT_BRANCH_NAME=${GIT_BRANCH_NAME} \
  VERSION=${VERSION} \
  RWP_BASE_URL=${RWP_BASE_URL}

RUN echo $GIT_COMMIT_HASH
RUN echo $GIT_BRANCH_NAME
RUN echo $VERSION

COPY .dist /usr/share/nginx/html
# RUN ls /usr/share/nginx/html

#COPY ./nginx.conf /etc/nginx/nginx.conf
COPY ./frontend.conf.template /etc/nginx/templates/
COPY ./minio.conf /etc/nginx/includes/

ADD ./00-browsertrix-nginx-init.sh ./docker-entrypoint.d/

