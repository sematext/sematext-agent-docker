#!/bin/bash
mkdir spmlogs > /dev/null
node_modules/docker-stats/stats.js > ./spmlogs/raw-metrics.log & pid=$!
sleep 2 && kill $pid

export NETWOK_LOG_FILE=./spmlogs/network_check.log
date > $NETWOK_LOG_FILE

function log() 
{
	echo "-------" >> $NETWOK_LOG_FILE 2>&1
	echo $1 $2 $3 $4
	echo $1 $2 $3 $4>> $NETWOK_LOG_FILE 2>&1
	$1 $2 $3 $4>> $NETWOK_LOG_FILE 2>&1
}

log ping -c 1 logsene-receiver.sematext.com
log nslookup logsene-receiver.sematext.com 
log ping -c 1 logsene-receiver.sematext.com 
log curl -vvv logsene-receiver.sematext.com 

log nslookup spm-receiver.sematext.com 
log ping -c 1 spm-receiver.sematext.com 
log curl -vvv spm-receiver.sematext.com 

log ifconfig 

spm-client-diagnostics-js
