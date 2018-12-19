#!/bin/bash

if [ "$1" == "build" ]; then
	docker build -t "sematext/sematext-agent-docker:test" ..
fi

# read tokens from local env.sh 
if [ -f "env.sh" ]; then
  source ./env.sh
fi

function log_count_test () 
{
	export NGINX_PORT=9998
  docker rm -f sematext-agent > /dev/null
	docker rm -f nginx1  > /dev/null
	docker pull jstarcher/siege > /dev/null 
	docker pull nginx > /dev/null   
  docker run -d --name sematext-agent -e SPM_TOKEN -e SPM_LOG_LEVEL="debug" -e SPM_LOG_TO_CONSOLE="1" -e ENABLE_LOGSENE_STATS="true" -e MATCH_BY_IMAGE="nginx" -e LOGSENE_TOKEN=$LOGSENE_TOKEN -e SPM_TOKEN=$SPM_TOKEN -v /var/run/docker.sock:/var/run/docker.sock sematext/sematext-agent-docker:test
  # use NGINX container ID as test ID
  export TEST_ID=$(docker run -d --name nginx1 -p $NGINX_PORT:80 nginx)  
	echo TEST_ID = $TEST_ID
  sleep 20 
  docker run --rm -t --net=host jstarcher/siege -r 5 -c 50 http://127.0.0.1:$NGINX_PORT/${TEST_ID} | grep Transactions
	#docker logs -f sematext-agent &
	sleep 120 
	echo '{"query" : { "query_string" : {"query": "message:'$TEST_ID' AND severity:error" }}}' > query.txt
	echo curl -XPOST "https://logsene-receiver.sematext.com/$LOGSENE_TOKEN/_count" -d @query.txt
	echo Elasticsearch Query: 
	cat query.txt
	export count=$(curl -XPOST "logsene-receiver.sematext.com/$LOGSENE_TOKEN/_count" -d @query.txt | jq '.count')
	echo "log count in Logsene: $count"
	# each nginx request generates 2 logs
	export generated_logs=250
	export result=$(expr $count  - $generated_logs)
	if [ "$result" == 0 ]; then
		echo SUCCESS $count logs shipped, diff: $result
		return 0
	else
		echo FAILED: $count logs shipped, diff: $result
		return -1
	fi 	
}

function container_count () 
{
	 docker run -d --name nginx2 nginx
	 sleep 5
	 docker rm -f nginx2	 
	 sleep 40  # wait for reporting in SDA console ...
	 container_count=$(docker logs sematext-agent 2>&1 | grep -E "body.*container-count.*no-filter" | awk -F'[t|"}/]' '{print $11}' | tail -n 1) 
	 docker_ps=$(docker ps | grep -v IMAGE | wc -l)
	 docker_ps=$(expr $docker_ps \* 1)
	 container_count=$(expr $container_count \* 1)
	 # echo "$docker_ps" | od -x
	 # echo "$container_count" | od -x
	 echo container count: sda: $container_count docker ps: $docker_ps
	 if [[ $docker_ps == $container_count ]]; then 
	 		echo SUCCESS: container count: $container_count "=" $docker_ps
	 		return 0
	 else
	 	  echo FAILED: container count: $container_count "!=" $docker_ps
	 		return 1
	 fi
}

function run_tests () 
{
	log_count_test
  T1=$?
  container_count
  T2=$?
  # return 0 when all tests pass
	if [ $T1 -eq 0 ] && [ $T2 -eq 0 ]; then
	  return 0
	else 
		return 1
	fi
}

run_tests
