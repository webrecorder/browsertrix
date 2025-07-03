FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./
COPY emails/package.json ./emails/

RUN yarn install --frozen-lockfile

COPY emails/ ./emails/

RUN yarn workspace browsertrix-emails build:api

FROM node:22-alpine AS runtime

WORKDIR /app

COPY package.json yarn.lock ./
COPY emails/package.json ./emails/

RUN yarn install --frozen-lockfile --production && yarn cache clean

COPY --from=builder /app/emails/dist ./dist

EXPOSE 3000

CMD ["node", "dist/api-server.js"]
