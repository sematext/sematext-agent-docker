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


sematext-agent-docker ${SPM_TOKEN} 