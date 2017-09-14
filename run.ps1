$APP_ROOT = '/usr/src/app'
# check docker secrets volume 
$CONFIG_FILE = '/run/secrets/sematext-agent'

if (Test-Path $CONFIG_FILE) {
   echo "Reading configuration from file: $CONFIG_FILE"
   . $CONFIG_FILE
}

$SPM_LOG_LEVEL = 'error'
$SPM_LOG_TO_CONSOLE = 'true'
$SPM_RECEIVER_URL = '$SPM_RECEIVER_URL'
$ENABLE_LOGSENE_STATS = 'false'
$SPM_RECEIVER_URL = 'https://spm-receiver.sematext.com:443/receiver/v1/_bulk'
$DOCKER_PORT = '2375'
$LOGSENE_TMP_DIR = '/logsene-log-buffer'
$MAX_CLIENT_SOCKETS = '1'
$LOGSENE_ENABLED_DEFAULT = 'true'

$ENABLE_AUTODETECT_SEVERITY = 'true'
# default is /tmp/ but this consumes 70 MB RAM
# to speed up GeoIP lookups the directory could be set back to /tmp/
$MAXMIND_DB_DIR = '$APP_ROOT'
$SPM_COLLECTION_INTERVAL_IN_MS = '10000'
$SPM_TRANSMIT_INTERVAL_IN_MS = '10000'

if ($env:PATTERNS_URL -ne $null) {
  mkdir /etc/logagent
}

if ($env:LOGAGENT_PATTERNS -ne $null) {
  mkdir /etc/logagent
  echo "writing LOGAGENT_PATTERNS to /etc/logagent/patterns.yml"
  echo "$LOGAGENT_PATTERNS" > /etc/logagent/patterns.yml
}

$GEOIP_ENABLED = 'false'
if ($env:GEOIP_ENABLED -eq "true" -and $env:LOGSENE_TOKEN -ne $null) {
  echo "GeoIP lookups: enabled"
}

mkdir $LOGSENE_TMP_DIR

if ($env:DOCKER_HOST -eq $null) {
  $DOCKER_HOST = "tcp://$(Get-NetIPConfiguration | Foreach IPv4DefaultGateway | Select -expand NextHop):${DOCKER_PORT}"
  echo "//./pipe/docker_engine is not available. Please set -e DOCKER_HOST=${DOCKER_HOST}"
  exit
}

$SPM_REPORTED_HOSTNAME = (docker-info Name)
echo "Docker Hostname: $SPM_REPORTED_HOSTNAME"

if ($env:DOCKERCLOUD_NODE_HOSTNAME -ne $null) {
  $SPM_REPORTED_HOSTNAME = '$DOCKERCLOUD_NODE_HOSTNAME'
  echo "Docker Cloud Node Hostname: $SPM_REPORTED_HOSTNAME"
}

if ($env:HOSTNAME_LOOKUP_URL -ne $null) {
  echo "Hostname lookup: $HOSTNAME_LOOKUP_URL"
  $SPM_REPORTED_HOSTNAME = (curl -s $HOSTNAME_LOOKUP_URL)
  echo "Hostname lookup from ${HOSTNAME_LOOKUP_URL}: $SPM_REPORTED_HOSTNAME"
}

mkdir /opt/spm
echo "docker_id=$(docker-info ID)" > /opt/spm/.docker
echo "docker_hostname=${SPM_REPORTED_HOSTNAME}" >> /opt/spm/.docker
cat /opt/spm/.docker

ls env:\
sematext-agent-docker $env:SPM_TOKEN
