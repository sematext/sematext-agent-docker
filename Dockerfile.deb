FROM node:4.3.0-slim

RUN apt-get update && apt-get install -y \
  curl \
 # Remove obsolete files:
 && apt-get clean \
 && rm -rf \
   /tmp/* \
   /usr/share/doc/* \
   /var/cache/* \
   /var/lib/apt/lists/* \
   /var/tmp/*

RUN curl -L \
 https://github.com/krallin/tini/releases/download/v0.9.0/tini \
 > /usr/local/bin/tini && chmod 755 /usr/local/bin/tini

COPY . /usr/src/app
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y git \
  && npm install -g \
  && apt-get remove --auto-remove -y git \
  # Remove obsolete files:
  && apt-get clean \
  && rm -rf \
    /tmp/* \
    /usr/share/doc/* \
    /var/cache/* \
    /var/lib/apt/lists/* \
    /var/tmp/*

RUN ln -s /usr/src/app/run.sh /usr/local/bin/run-sematext-agent

EXPOSE 9000

ENTRYPOINT ["tini", "--"]
CMD ["run-sematext-agent"]
