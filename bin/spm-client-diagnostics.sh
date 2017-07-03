#!/bin/bash
mkdir spmlogs 2> /dev/null
node_modules/docker-stats/stats.js > ./spmlogs/raw-metrics.log & pid=$!
sleep 2 && kill $pid

export NETWORK_LOG_FILE=./spmlogs/network_check.log
date > $NETWORK_LOG_FILE

function log() 
{
	echo "-------" >> $NETWORK_LOG_FILE 2>&1
	echo -n $1 $2 $3 $4 
	echo $1 $2 $3 $4>> $NETWORK_LOG_FILE 2>&1
	$1 $2 $3 $4>> $NETWORK_LOG_FILE 2>&1
	RV=$?
	if (($RV > 0)); then
      printf ' Failed\n' $RV >&2
    else
      printf ' OK\n' $RV >&2	
    fi
}

log nslookup logsene-receiver.sematext.com 
log curl -vvv logsene-receiver.sematext.com 

log nslookup logsene-receiver.eu.sematext.com 
log curl -vvv logsene-receiver.eu.sematext.com 

log nslookup spm-receiver.sematext.com 
log curl -vvv http://spm-receiver.sematext.com/receiver/isAlive 

log nslookup spm-receiver.eu.sematext.com 
log curl -vvv http://spm-receiver.eu.sematext.com/receiver/isAlive 

log ifconfig 
cat $NETWORK_LOG_FILE
spm-client-diagnostics-js
