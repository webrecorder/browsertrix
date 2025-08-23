FROM node:22-alpine AS builder


WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build:api

FROM node:22-alpine AS runtime

ARG GIT_COMMIT_HASH
ENV NODE_ENV=production

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --production && yarn cache clean

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/api-server.js"]
