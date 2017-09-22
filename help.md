
# Sematext Agent for Docker

Sematext Agent for Docker collects Metrics, Events and Logs from the Docker API for Sematext Cloud/Enterprise.

## Gathered information

**Operating System Metrics** - Host machine metrics CPU / Mem / Swap / IO  

**Docker Container Metrics/Stats** -  CPU Usage, Memory Usage, Network Stats, Disk I/O Stats

**Events** - Agent Startup Event, server-info – created by spm-agent framework with node.js and OS version info on startup, docker-info – Docker Version, API Version, Kernel Version on startup |

**Docker Events** - Container Lifecycle Events (create, exec_create, destroy, export, ...). Container Runtime Events (die, exec, kill, pause, restart, start, stop, unpause, ... )

**Docker Log** - default fields: host / IP address, docker_host, container id, container name, image name,  message

**Log format detection and log parsers** -  NGINX, Apache httpd, Kafka, Solr, HBase, Zookeeper, Cassandra, MySQL, MongoDB, Redis, Elasticsearch, Nsq.io, JSON, Plain Text 

## Installation 

Get a free account at https://sematext.com  

Create an SPM App of type "Docker" and copy the SPM Application Token 
For logs (optional) create a Logsene App to obtain an App Token for Logsene  

Run the image (please use your individual SPM and Logsene token!)

   ```
   docker pull sematext/sematext-agent-docker
   docker run -d --name sematext-agent-docker -e SPM_TOKEN=YOUR_SPM_TOKEN -e LOGSENE_TOKEN=YOUR_LOGSENE_TOKEN -v /var/run/docker.sock:/var/run/docker.sock sematext/sematext-agent-docker
   ```

You’ll see your Docker metrics in SPM after about a minute. 
Watch metrics, use anomaly detection for alerts, create e-mail reports and much more.

## Configuration Parameters

| Parameter / Environment variable | Description |
|-----------|-------------|
|**Required Parameters**| |
| SPM_TOKEN        | SPM Application Token, enables metric and event collection |
| LOGSENE_TOKEN    | Logsene Application Token enables logging to Logsene, see logging specifc parameters for filter options and Log Routing section to route logs from different containers to separate Logsene applications| 
| ```-v /var/run/docker.sock ```  | Path to the docker socket (optional, if dockerd provides TCP on 2375, see also DOCKER_PORT and DOCKER_HOST parameter) |
|**TCP and TLS connection** | If the unix socket is not available Sematext Agent assumes the Container Gateway Address (autodetect) and port 2375 as default (no TLS) - this needs no configuration. In case the Docker Daemon TCP settings are different, you have to configure the TCP settings. The TCP settings can be modified with the following parameters|
|DOCKER_HOST| e.g. tcp://ip-reachable-from-container:2375/ - default value 'unix:///var/run/docker.sock'. When the unix socket is not available the agent tries to connect to tcp://gateway:2375. In case a TCP socket is used there is no need to mount the Docker unix socket as volume |
| DOCKER_PORT | Sematext Agent will use its gateway address (autodetect) with the given DOCKER_PORT|
|DOCKER_TLS_VERIFY | 0 or 1|
|DOCKER_CERT_PATH | Path to your certificate files, mount the path to the container with "-v $DOCKER_CERT_PATH:$DOCKER_CERT_PATH" |  
|**Configuration via docker swarm secrets:**| |
| CONFIG_FILE| Path to the configuration file, containing environment variables `key=value`. Default value: `/run/secrets/sematext-agent`. Create a secret with  `docker secret create sematext-agent ./sematext-agent.cfg`. Start Sematext Docker agent with `docker service create --mode global --secret sematext-agent --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock sematext/sematext-agent-docker |
|**Optional Parameters:**| |
| --privileged | The parameter might be helpful when Sematext Agent could not start because of limited permission to connect and write to the Docker socket /var/run/docker.sock. The privileged mode is a potential security risk, we recommend to enable the appropriate security. Please read about Docker security: https://docs.docker.com/engine/security/security/ |
| HOSTNAME_LOOKUP_URL | On Amazon ECS, a [metadata query](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html) must be used to get the instance hostname (e.g. "169.254.169.254/latest/meta-data/local-hostname")|
| HTTPS_PROXY | URL for a proxy server (behind firewalls)|
| LOGSENE_RECEIVER_URL | URL for bulk inserts into Logsene. Required for Logsene On-Premises only.|
| SPM_RECEIVER_URL | URL for bulk inserts into SPM. Required for SPM On-Premises only. |
| EVENTS_RECEIVER_URL | URL for SPM events receiver. Required for SPM On-Premises only. |
|**Docker Logs Parameters**| |
| TAGGING_LABELS | A list of docker label names or environment variable names to tag container logs. Supporting wildcards e.g. TAGGING_LABELS='com.docker.swarm*,com.myapp.*' |
|   __Whitelist containers for logging__ | |
| MATCH_BY_NAME |  Regular expression to white list container names |
| MATCH_BY_IMAGE | Regular expression to white list image names |
|   __Blacklist containers__ | |
| SKIP_BY_NAME | Regular expression to black list container names |
| SKIP_BY_IMAGE | Regular expression to black list image names for logging | 
| PATTERNS_URL | Load pattern.yml via HTTP e.g. ```-e PATTERNS_URL=https://raw.githubusercontent.com/sematext/logagent-js/master/patterns.yml``` |
| LOGAGENT_PATTERNS_BASE64 | Set to "true" if the LOGAGENT_PATTERNS patterns file you are passing in via env. variable is base64 encoded e.g ```-e LOGAGENT_PATTERNS="$(cat ./patterns.yml | base64)"```. Useful if your params file is not getting set properly due to shell interpretation or otherwise. |
| LOGAGENT_PATTERNS | Pass patterns.yml via env. variable e.g. ```-e LOGAGENT_PATTERNS="$(cat ./patters.yml)"``` |
| PATTERN_MATCHING_ENABLED | Activate [logagent-js parser](https://sematext.github.io/logagent-js/parser/), default value is ```true```. To disable the log parser set the value to ```false```. This could increase the throughput of log processing for nodes with a very high log volume.|
| -v /yourpatterns/patterns.yml:/etc/logagent/patterns.yml | to provide custom patterns for log parsing, see [logagent-js](https://github.com/sematext/logagent-js)|
| -v /tmp:/logsene-log-buffer | Directory to store logs, in case of a network or service outage. Docker Agent deletes these files after successful transmission.|
| GEOIP_ENABLED | ```true```enables GeoIP lookups in the log parser, default value: ```false```| 
| MAXMIND_DB_DIR | Directory for the Geo-IP lite database, must end with ```/```. Storing the DB in a volume could save downloads for updates after restarts. Using ```/tmp/``` (ramdisk) could speed up Geo-IP lookups (consumes add. ~30 MB main memory).|
|ENABLE_LOGSENE_STATS | Enables logging of tranmission stats to Logsene. Default value 'false'. Provides number of logs received, number of logs shipped, number of failed/successful http tranmissions (bulk requests to Logsene) and re-transmissions of failed requests. |

# Log Routing

Routing logs from different containers to separate Logsene Apps can be configured via docker labels (or environment variables e.g. on Kubernetes). Simply tag a container with the label (or environment variable) ```LOGSENE_TOKEN=YOUR_LOGSENE_TOKEN```. 
Sematext Agent inspects the containers for this Label and ships the logs to the defined Logsene App. 

To disable logging to Logsene/Elasticsearch label the application container with ```LOGSENE_ENABLED=false```. ```LOGSENE_ENABLED=true``` enables logging for the container again. 

__Example:__ 
The following command will start nginx webserver and logs for this container will be shipped to the related Logsene App. 

```
docker run --label LOGSENE_TOKEN=REPLACE_WITH_YOUR_LOGSENE_TOKEN -p 80:80 nginx
# or use environment variable on Kubernetes (no support for Docker labels)
# docker run -e LOGSENE_TOKEN=REPLACE_WITH_YOUR_LOGSENE_TOKEN -p 80:80 nginx
```

All other container logs will be shipped to the Logsene App specified in the docker run command for ```sematext/sematext-agent-docker``` with the environment variable ```LOGSENE_TOKEN```.

# Integrated Log Parser

SPM for Docker recognizes log formats - so your logs arrive in a structured format in Logsene!
The format recognition, data extractions, date parsing etc. is provided by [logagent-js](https://github.com/sematext/logagent-js) and covers:

- Format detection e.g. for
  - Mongo DB
	- Nginx
	- Apache httpd, Kafka, Cassandra, HBase, Solr, Zookeeper
	- MySQL
	- Redis  
- plain text log messages
- line delimited JSON logs
- GeoIP enrichment for webserver logs, or any other field defined
  in the pattern definitions

To use a custom pattern definition simply mount a volume to '/etc/logagent/patterns.yml':
```
-v /mydir/patterns.yml:/etc/logagent/patterns.yml
```

Feel free to contribute to [logagent-js](https://github.com/sematext/logagent-js) to enrich the default pattern set. 

# Installation on Docker Swarm 

For Swarm on Docker engine > v1.12 use a global service to deploy the agent to all cluster nodes:

```
docker service create --mode global --reserve-memory 128mb --restart-condition any \
--name sematext-agent-docker \
--mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
-e SPM_TOKEN=YOUR_SPM_TOKEN  \
-e LOGSENE_TOKEN=YOUR_LOGSENE_TOKEN \
sematext/sematext-agent-docker 
```

Adjust the reserved memory to your needs (>70 MB). 

Please read [Docker Swarm: Collecting Metrics, Events & Logs](http://blog.sematext.com/2016/01/12/docker-swarm-collecting-metrics-events-logs/) for previous Swarm versions. 

# Support

Please check the [SPM for Docker Wiki](https://sematext.atlassian.net/wiki/display/PUBSPM/SPM+for+Docker)

If you have questions about SPM for Docker, chat with us in the [SPM user interface](https://apps.sematext.com/users-web/login.do) or drop an e-mail to support@sematext.com

Open an issue [here](https://github.com/sematext/sematext-agent-docker/issues) 

Contribution guide [here](https://github.com/sematext/sematext-agent-docker/blob/master/contribute.md)
