export LOGSENE_TOKEN=$(cat ./docker-compose.yml | grep LOGSENE_TOKEN | awk '{print $2}' | tr = ' ' | awk '{print $2}')
export PORT=$(cat ./docker-compose.yml | grep :80 | awk '{print $2}' | tr : ' ' | awk '{print $1}')
docker-compose up -d 
function log_count_test () 
{
	# generate random test ID
	export TEST_ID=TEST$(jot  -r 1 1000 90000)
	echo testID = $TEST_ID
	export LOG_NO=5
	siege -r $LOG_NO -c 50 http://127.0.0.1:$PORT/${TEST_ID}
	sleep 35 
	echo curl logsene-receiver.sematext.com/$LOGSENE_TOKEN/_count?q=$TEST_ID
	export count=$(curl "logsene-receiver.sematext.com/$LOGSENE_TOKEN/_count?q=$TEST_ID" | jq '.count')
	echo "log count in Logsene: $count"
	# each nginx request generates 2 logs
	export result=$(expr $count  - $LOG_NO \* 50 \* 2)
	if [ $result == 0 ]; then
		echo SUCCESS $count $result
	else
		echo failed: $count $result
	fi 	
}
log_count_test