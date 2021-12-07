FROM node:16 as build

WORKDIR /app
COPY package.json .
COPY yarn.lock .
RUN yarn --frozen-lockfile
COPY *.* ./
COPY src ./src/
RUN yarn build


FROM nginx

COPY --from=build /app/dist /usr/share/nginx/html

COPY ./nginx.conf.template /etc/nginx/templates/

RUN rm /etc/nginx/conf.d/*

RUN mkdir -p /etc/nginx/resolvers; echo "" > /etc/nginx/resolvers/resolvers.conf

