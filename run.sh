#!/bin/sh
set -e
export APP_ROOT=${APP_ROOT:-/usr/src/app}
# check docker secrets volume 
export CONFIG_FILE=${CONFIG_FILE:-/run/secrets/sematext-agent}
set -o allexport
if [ -f "$CONFIG_FILE" ]
then
  echo "Reading configuration from file: ${CONFIG_FILE}"
  source $CONFIG_FILE
fi

export SPM_LOG_LEVEL=${SPM_LOG_LEVEL:-error}
export SPM_LOG_TO_CONSOLE=${SPM_LOG_TO_CONSOLE:-true}
export SPM_RECEIVER_URL=${SPM_URL:-$SPM_RECEIVER_URL}
export ENABLE_LOGSENE_STATS=${ENABLE_LOGSENE_STATS:-false}
export SPM_RECEIVER_URL=${SPM_RECEIVER_URL:-https://spm-receiver.sematext.com:443/receiver/v1/_bulk}
export DOCKER_PORT=${DOCKER_PORT:-2375}
export LOGSENE_TMP_DIR=/logsene-log-buffer
export MAX_CLIENT_SOCKETS=${MAX_CLIENT_SOCKETS:-1}
export LOGSENE_ENABLED_DEFAULT=${LOGSENE_ENABLED_DEFAULT:-true}

export ENABLE_AUTODETECT_SEVERITY=${ENABLE_AUTODETECT_SEVERITY:-true}
# default is /tmp/ but this consumes 70 MB RAM
# to speed up GeoIP lookups the directory could be set back to /tmp/
export MAXMIND_DB_DIR=${MAXMIND_DB_DIR:-$APP_ROOT}
export SPM_COLLECTION_INTERVAL_IN_MS=${SPM_COLLECTION_INTERVAL_IN_MS:-10000}
export SPM_TRANSMIT_INTERVAL_IN_MS=${SPM_TRANSMIT_INTERVAL_IN_MS:-10000}

function generate_eu_config()
{
echo -e "SPM_RECEIVER_URL=https://spm-receiver.eu.sematext.com/receiver/v1
EVENTS_RECEIVER_URL=https://event-receiver.eu.sematext.com
LOGSENE_RECEIVER_URL=https://logsene-receiver.eu.sematext.com" > /etc/sematext/receivers.config
}

function generate_us_config()
{
echo -e "SPM_RECEIVER_URL=https://spm-receiver.sematext.com/receiver/v1
EVENTS_RECEIVER_URL=https://event-receiver.sematext.com
LOGSENE_RECEIVER_URL=https://logsene-receiver.sematext.com" > /etc/sematext/receivers.config
}

if [ "$REGION" == "EU" ]; then 
  generate_eu_config
  echo "Set region $REGION in /etc/sematext/receivers.config:"
  cat /etc/sematext/receivers.config
  exit 0
fi;
if [ "$REGION" == "US" ]; then 
  generate_us_config
  echo "Set region $REGION in /etc/sematext/receivers.config:"
  cat /etc/sematext/receivers.config
  exit 0
fi;
      

if [ -n "${PATTERNS_URL}" ]; then
  mkdir -p /etc/logagent
fi

if [ -n "${LOGAGENT_PATTERNS}" ]; then
  if [ "${LOGAGENT_PATTERNS_BASE64}" == "true" ]; then
    # If the logagent patterns file is an environment variable, and base64 encoded
    mkdir -p /etc/logagent
    echo "writing LOGAGENT_PATTERNS to /etc/logagent/patterns.yml"
    echo "$LOGAGENT_PATTERNS" | base64 -d > /etc/logagent/patterns.yml
  else
    mkdir -p /etc/logagent
    echo "writing LOGAGENT_PATTERNS to /etc/logagent/patterns.yml"
    echo "$LOGAGENT_PATTERNS" > /etc/logagent/patterns.yml
  fi
fi

export GEOIP_ENABLED=${GEOIP_ENABLED:-"false"}
if [[ "$GEOIP_ENABLED" == "true" && -n "${LOGSENE_TOKEN}" ]]; then
  echo "GeoIP lookups: enabled" 
fi

mkdir -p $LOGSENE_TMP_DIR

if [ -z "${DOCKER_HOST}" ]; then
  if [ -r /var/run/docker.sock ]; then
    export DOCKER_HOST=unix:///var/run/docker.sock
  else
    export DOCKER_HOST=tcp://$(netstat -nr | grep '^0\.0\.0\.0' | awk '{print $2}'):$DOCKER_PORT
    echo "/var/run/docker.sock is not available set DOCKER_HOST=$DOCKER_HOST"
  fi
fi

export SPM_REPORTED_HOSTNAME=$(docker-info Name)
echo "Docker Hostname: ${SPM_REPORTED_HOSTNAME}"

if [ -n "${DOCKERCLOUD_NODE_HOSTNAME}" ]; then
  export SPM_REPORTED_HOSTNAME=$DOCKERCLOUD_NODE_HOSTNAME
  echo "Docker Cloud Node Hostname: ${SPM_REPORTED_HOSTNAME}"
fi

if [ -n "${HOSTNAME_LOOKUP_URL}" ]; then
  echo Hostname lookup: ${HOSTNAME_LOOKUP_URL}
  export SPM_REPORTED_HOSTNAME=$(curl -s $HOSTNAME_LOOKUP_URL)
  echo "Hostname lookup from ${HOSTNAME_LOOKUP_URL}: ${SPM_REPORTED_HOSTNAME}"
fi

mkdir -p /opt/spm
echo "docker_id=$(echo $(docker-info ID))" > /opt/spm/.docker
echo "docker_hostname=${SPM_REPORTED_HOSTNAME}" >> /opt/spm/.docker
cat /opt/spm/.docker
chmod 555 /opt/spm/.docker

echo $(env)
exec sematext-agent-docker ${SPM_TOKEN}
