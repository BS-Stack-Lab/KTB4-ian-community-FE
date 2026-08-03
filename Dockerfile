# syntax=docker/dockerfile:1.12

ARG NODE_IMAGE=node:24.14.0-alpine3.23
ARG NGINX_IMAGE=nginx:1.28.2-alpine3.23

FROM ${NODE_IMAGE} AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY index.html webpack.config.js ./
COPY src ./src

RUN npm run build:react \
    && find dist -type f -name '*.map' -delete

FROM ${NGINX_IMAGE} AS runtime

RUN apk add --no-cache libcap \
    && setcap 'cap_net_bind_service=+ep' /usr/sbin/nginx \
    && apk del libcap \
    && rm -f /etc/nginx/conf.d/default.conf

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder --chown=nginx:nginx /app/index.html /usr/share/nginx/html/index.html
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html/dist

USER nginx

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/healthz || exit 1

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
