FROM node:22-alpine AS build
WORKDIR /app
COPY web/package.json ./
RUN npm install
COPY web ./
RUN npm run build

FROM alpine:3.20
COPY --from=build /app/dist /dist
CMD ["sh", "-c", "mkdir -p /out && rm -rf /out/* && cp -a /dist/. /out/ && exec sleep infinity"]
