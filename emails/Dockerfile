FROM node:22-alpine AS builder


WORKDIR /app

RUN corepack enable yarn

COPY .yarnrc.yml package.json yarn.lock ./

RUN yarn install --immutable

COPY . .

RUN yarn build:api

FROM node:22-alpine AS runtime

ARG GIT_COMMIT_HASH
ARG GIT_BRANCH_NAME
ARG VERSION

ENV GIT_COMMIT_HASH=${GIT_COMMIT_HASH} \
    GIT_BRANCH_NAME=${GIT_BRANCH_NAME} \
    VERSION=${VERSION} \
    NODE_ENV=production

WORKDIR /app

RUN corepack enable yarn

COPY .yarnrc.yml package.json yarn.lock ./

RUN yarn workspaces focus --production && yarn cache clean

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/api-server.js"]
