#!/bin/bash
if [[ -n "$1" && -n "$2" ]] ; then 
	export LOGSENE_TOKEN=$1
	export LOGSENE_GATEWAY_PORT=$2
	etcdctl set /sematext.com/myapp/logsene/token $LOGSENE_TOKEN
	etcdctl set /sematext.com/myapp/logsene/gateway_port $LOGSENE_GATEWAY_PORT

	wget https://raw.githubusercontent.com/sematext/sematext-agent-docker/master/coreos/sematext-agent.service
	fleetctl load sematext-agent.service; fleetctl start sematext-agent.service
	wget https://raw.githubusercontent.com/sematext/sematext-agent-docker/master/coreos/logsene.service
	fleetctl load logsene.service; fleetctl start logsene.service;
else 
    else
	  echo "Missing paramaters. Usage:"
	  echo "install_logsene_service.sh LOGSENE_TOKEN LOGSENE_GATEWAY_PORT (e.g. 9000)"
	  echo "Please obtain your access tokens here: https://apps.sematext.com/"
    fi
fi 
