FROM alpine:3.4

RUN apk --no-cache add \
    git \
    tini \
    nodejs \
    procps \
    curl \
    coreutils

COPY . /usr/src/app
WORKDIR /usr/src/app

RUN apk --no-cache add --virtual deps git \
  && npm install -g \
  && apk del deps \
  # Clean up obsolete files:
  && rm -rf \
    /tmp/* \
    /root/.npm

RUN ln -s /usr/src/app/run.sh /usr/local/bin/run-sematext-agent
RUN cd /usr/lib/node_modules/sematext-agent-docker/node_modules/docker-loghose && npm i megastef/docker-allcontainers
RUN cd /usr/lib/node_modules/sematext-agent-docker/node_modules/docker-stats && npm i megastef/docker-allcontainers
RUN cd /usr/lib/node_modules/sematext-agent-docker/node_modules/docker-events && npm i megastef/docker-allcontainers

EXPOSE 9000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["run-sematext-agent"]
