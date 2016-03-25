#!/bin/sh

set -e
export spmagent_spmSenderBulkInsertUrl=${SPM_URL:-https://spm-receiver.sematext.com:443/receiver/v1/_bulk}
export DOCKER_PORT=${DOCKER_PORT:-2375}
export LOGSENE_TMP_DIR=/logsene-log-buffer
# defaut is /tmp/ but this consumes 70 MB ram
# to speed up GeoIP lookups the directory could be set back to /tmp/
export MAXMIND_DB_DIR=${MAXMIND_DB_DIR:-/usr/src/app}
mkdir -p $LOGSENE_TMP_DIR

if [ -z "${DOCKER_HOST}" ]; then
  if [ -r /var/run/docker.sock ]; then
    export DOCKER_HOST=unix:///var/run/docker.sock
  else
    export DOCKER_HOST=tcp://$(netstat -nr | grep '^0\.0\.0\.0' | awk '{print $2}'):$DOCKER_PORT
    echo "/var/run/docker.sock is not available set DOCKER_HOST=$DOCKER_HOST"
  fi
fi

export HOSTNAME=$(docker-info Name)
echo "Docker Hostname: ${HOSTNAME}"

if [ -n "${DOCKERCLOUD_NODE_HOSTNAME}" ]; then
  export HOSTNAME=$DOCKERCLOUD_NODE_HOSTNAME
  echo "Docker Cloud Node Hostname: ${HOSTNAME}"
fi

if [ -n "${HOSTNAME_LOOKUP_URL}" ]; then
  echo Hostname lookup: ${HOSTNAME_LOOKUP_URL}
  export HOSTNAME=$(curl -s $HOSTNAME_LOOKUP_URL)
  echo "Hostname lookup from ${HOSTNAME_LOOKUP_URL}: ${HOSTNAME}"
fi

exec sematext-agent-docker ${SPM_TOKEN}
