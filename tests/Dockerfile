FROM mcr.microsoft.com/playwright:v1.49.0-jammy
USER root
RUN apt-get update && apt-get install -y --no-install-recommends docker.io bash ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY tests /app/tests
COPY shared /app/shared
COPY scripts /app/scripts
COPY pb_hooks /app/pb_hooks
COPY pb_migrations /app/pb_migrations
COPY sync /app/sync
COPY web/src/types.ts /app/web/src/types.ts
COPY .env.example /app/.env.example
COPY docker-compose.yml /app/docker-compose.yml
COPY caddy/entrypoint.sh /app/caddy/entrypoint.sh
WORKDIR /app/tests
RUN npm install
ENV BASE_URL=http://127.0.0.1
CMD ["npm", "test"]
