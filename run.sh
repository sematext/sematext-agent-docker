set -e 
export DOCKER_PORT=${DOCKER_PORT:-2375}

if [ -z "${DOCKER_HOST}" ]; then 
	if [ -r /var/run/docker.sock ]; then 
        export DOCKER_HOST=unix:///var/run/docker.sock
	else
        export DOCKER_HOST=tcp://$(netstat -nr | grep '^0\.0\.0\.0' | awk '{print $2}'):$DOCKER_PORT
        echo "/var/run/docker.sock is not available set DOCKER_HOST=$DOCKER_HOST"
	fi
fi

export HOSTNAME=$(bin/docker-info.js Name)
echo "Docker Hostname: ${HOSTNAME}"

if [ -n "${TUTUM_NODE_HOSTNAME}" ]; then 
	export HOSTNAME=$TUTUM_NODE_HOSTNAME
	echo "Tutum Node Hostname: ${HOSTNAME}"
fi

if [ -n "${HOSTNAME_LOOKUP_URL}" ]; then 
	echo Hostname lookup: ${HOSTNAME_LOOKUP_URL}
	export HOSTNAME=$(curl -s $HOSTNAME_LOOKUP_URL)
	echo "Hostname lookup from ${HOSTNAME_LOOKUP_URL}: ${HOSTNAME}"
fi

sematext-agent-docker ${SPM_TOKEN} 