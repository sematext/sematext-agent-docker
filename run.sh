set -e 

if [ -n "${TUTUM_NODE_HOSTNAME}" ]; then 
	export HOSTNAME=$TUTUM_NODE_HOSTNAME
	echo "Tutum Node Hostname: ${HOSTNAME}"
fi

if [ -n "${HOSTNAME_LOOKUP_URL}" ]; then 
	echo Hostname lookup: ${HOSTNAME_LOOKUP_URL}
	export HOSTNAME=$(curl -s $HOSTNAME_LOOKUP_URL)
	echo $HOSTNAME
fi

if [ -z "${DOCKER_HOST}" ]; then 
	if [ -r /var/run/docker.sock ]; then 
        export DOCKER_HOST=unix:///var/run/docker.sock
	else
        export DOCKER_HOST=tcp://$(netstat -nr | grep '^0\.0\.0\.0' | awk '{print $2}'):2375
        echo "/var/run/docker.sock is not available set DOCKER_HOST=$DOCKER_HOST"
	fi
fi

sematext-agent-docker ${SPM_TOKEN} 