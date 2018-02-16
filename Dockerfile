FROM node:8-alpine
# RUN apk update && apk upgrade
RUN apk --no-cache add \
    tini \
    procps 
#    coreutils \
#    bash

COPY . /usr/src/app
WORKDIR /usr/src/app

# RUN apk --no-cache add --virtual deps git 
RUN npm install -g 
# remove vulnerable (indirect) dependency to zmq 
RUN npm rm -g aedes
# RUN apk del libzmq
# RUN apk del deps 
RUN ln -s /usr/src/app/run.sh /usr/local/bin/run-sematext-agent

EXPOSE 9000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["run-sematext-agent"]
