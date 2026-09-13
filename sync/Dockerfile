FROM node:22-alpine
RUN apk add --no-cache wget
WORKDIR /app
ARG BUILD_TIME_MS=0
ENV BUILD_TIME_MS=$BUILD_TIME_MS
COPY shared /app/shared
COPY sync /app/sync
WORKDIR /app/sync
EXPOSE 8091
CMD ["node", "index.mjs"]
