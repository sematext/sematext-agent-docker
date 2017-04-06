#!/bin/bash
# read tokens from local env.sh 
if [ "$1" == "build" ]; then
	docker build -t "sematext/sematext-agent-docker:test" ..
fi
if [ -f "env.sh" ]; then
  source ./env.sh
fi

function log_count_test () 
{
	export NGINX_PORT=9998
  docker rm -f sematext-agent > /dev/null
	docker rm -f nginx1  > /dev/null
  docker run -d --name sematext-agent -e ENABLE_LOGSENE_STATS="true" -e MATCH_BY_IMAGE="nginx" -e LOGSENE_TOKEN=$LOGSENE_TOKEN -e SPM_TOKEN=$SPM_TOKEN -v /var/run/docker.sock:/var/run/docker.sock sematext/sematext-agent-docker:test
  # use NGINX container ID as test ID
  export TEST_ID=$(docker run -d --name nginx1 -p $NGINX_PORT:80 nginx)  
	echo TEST_ID = $TEST_ID
  sleep 20 
  docker run --rm -t --net=host jstarcher/siege -r 5 -c 50 http://127.0.0.1:$NGINX_PORT/${TEST_ID} | grep Transactions
	docker logs -f sematext-agent &
	sleep 60 
	docker stop sematext-agent 
	echo '{"query" : { "query_string" : {"query": "path:'$TEST_ID' AND status_code:404" }}}' > query.txt
	echo curl -XPOST "https://logsene-receiver.sematext.com/$LOGSENE_TOKEN/_count" -d @query.txt
	echo Elasticsearch Query: 
	cat query.txt
	export count=$(curl -XPOST "logsene-receiver.sematext.com/$LOGSENE_TOKEN/_count" -d @query.txt | jq '.count')
	echo "log count in Logsene: $count"
	# each nginx request generates 2 logs
	export generated_logs=250
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