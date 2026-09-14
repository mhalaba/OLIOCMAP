FROM caddy:2.8-alpine
RUN apk add --no-cache wget
COPY Caddyfile.off Caddyfile.internal Caddyfile.file /tpl/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["sh", "/entrypoint.sh"]
