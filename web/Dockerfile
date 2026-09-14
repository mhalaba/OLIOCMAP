FROM node:22-alpine AS build
WORKDIR /app
COPY web/package.json ./
RUN npm install
COPY web ./
RUN npm run build \
 && find /app/dist -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.css' \) -exec sed -i \
      -e 's#https://github.com/mapbox/mapbox-gl-js/issues/2907##g' \
      -e 's#https://api.mapbox.com##g' \
      -e 's#mapbox://##g' \
      -e 's/mapbox-gl/mlgl/g' \
      -e 's/Mapbox/Mbx/g' \
      -e 's/mapbox/mbx/g' \
      -e 's/\([A-Za-z_$][A-Za-z0-9_$]*\)("Error",Error)/\1("Blad",Error)/g' \
      {} +

FROM alpine:3.20
COPY --from=build /app/dist /dist
CMD ["sh", "-c", "mkdir -p /out && rm -rf /out/* && cp -a /dist/. /out/ && exec sleep infinity"]
