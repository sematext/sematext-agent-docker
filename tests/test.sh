#!/bin/bash
# read tokens from local env.sh 
if [ "$1" == "build" ]; then
	docker build -t "sematext/sematext-agent-docker:test" ..
fi
if [ -f "env.sh" ]; then
  source ./env.sh
fi
export NGINX_PORT=9998
# docker rm -f sematext-agent
docker run -d --name sematext-agent -e LOGSENE_TOKEN=$LOGSENE_TOKEN -e SPM_TOKEN=$SPM_TOKEN -v /var/run/docker.sock:/var/run/docker.sock sematext/sematext-agent-docker:test
docker run -d -p $NGINX_PORT:80 nginx  
function log_count_test () 
{
	# generate random test ID
	export TEST_ID=TEST$(awk -v min=1000 -v max=900000 'BEGIN{srand(); print int(min+rand()*(max-min+1))}')$(awk -v min=1000 -v max=900000 'BEGIN{srand(); print int(min+rand()*(max-min+1))}')
	echo testID = $TEST_ID
	export LOG_NO=5
	docker run --rm -t --net=host jstarcher/siege -r $LOG_NO -c 50 http://127.0.0.1:$NGINX_PORT/${TEST_ID} | grep Transactions
	sleep 40 
	echo '{"query" : { "query_string" : {"query": "path:'$TEST_ID' AND status_code:404" }}}' > query.txt
	echo curl -XPOST "https://logsene-receiver.sematext.com/LOGSENE_TOKEN/_count?q=path:?$TEST_ID" -d @query.txt
	export count=$(curl -XPOST "logsene-receiver.sematext.com/$LOGSENE_TOKEN/_count?q=path:?$TEST_ID" -d @query.txt | jq '.count')
	echo "log count in Logsene: $count"
	# each nginx request generates 2 logs
	export generated_logs=$(expr $LOG_NO \* 50 \* 2)
	echo $generated_logs
	export result=$(expr $count  - $generated_logs)
	if [ $result == 0 ]; then
		echo SUCCESS $count $result
		return 0
	else
		echo failed: $count $result
		return -1
	fi 	
}
log_count_test