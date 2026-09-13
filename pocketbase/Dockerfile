FROM alpine:3.20
ARG PB_VERSION=0.30.4
RUN apk add --no-cache ca-certificates unzip wget tzdata
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb && chmod +x /pb/pocketbase && rm /tmp/pb.zip
WORKDIR /pb
EXPOSE 8090
HEALTHCHECK --interval=5s --timeout=3s --retries=20 --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
CMD ["/pb/pocketbase","serve","--http=0.0.0.0:8090","--dir=/pb/pb_data","--hooksDir=/pb/pb_hooks","--migrationsDir=/pb/pb_migrations","--publicDir=/pb/pb_public"]
