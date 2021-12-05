FROM node:16 as build

WORKDIR /app
COPY . .
# disabled to speed up build, assuming built locally
#RUN yarn
RUN yarn build

FROM nginx

COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/nginx.conf.template /etc/nginx/templates/

#COPY ./dist /usr/share/nginx/html
#COPY ./nginx.conf.template /etc/nginx/templates/

RUN rm /etc/nginx/conf.d/*

RUN mkdir -p /etc/nginx/resolvers; echo "" > /etc/nginx/resolvers/resolvers.conf

