FROM alpine:edge

RUN apk --no-cache add \
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

EXPOSE 9000

ENTRYPOINT ["tini", "--"]
CMD ["run-sematext-agent"]
