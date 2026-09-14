FROM node:22-alpine
RUN apk add --no-cache wget ca-certificates \
 && wget -qO /tmp/pmtiles.tgz https://github.com/protomaps/go-pmtiles/releases/download/v1.31.2/go-pmtiles_1.31.2_Linux_x86_64.tar.gz \
 && tar -xzf /tmp/pmtiles.tgz -C /tmp \
 && mv /tmp/pmtiles /usr/local/bin/pmtiles \
 && chmod +x /usr/local/bin/pmtiles \
 && rm -f /tmp/pmtiles.tgz
WORKDIR /app
ARG BUILD_TIME_MS=0
ENV BUILD_TIME_MS=$BUILD_TIME_MS
COPY shared /app/shared
COPY sync /app/sync
COPY data /app/data
WORKDIR /app/sync
EXPOSE 8091
CMD ["node", "index.mjs"]
