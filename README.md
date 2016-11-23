# Image tags
- latest - the latest release (stable)
- X.Y.Z - release version (stable) 
- X.Y.Z-rc1-N - release canditates (unstable)
- dev - build from github master branch (unstable)
- swarm3k - custom build for SwarmZilla, used only for the swarm3k test.

# Sematext Agent for Docker
||||
|---|------------|------------|
| [![Sematext Docker ETP partner for Logging](https://sematext.files.wordpress.com/2015/12/docker_etp_program_logo_square.png?w=125&h=124)](http://blog.sematext.com/2015/12/15/docker-logging-partner-sematext-logsene/) | [![Deploy to Docker Cloud](https://files.cloud.docker.com/images/deploy-to-dockercloud.svg)](https://cloud.docker.com/stack/deploy/?repo=https://github.com/sematext/sematext-agent-docker) | ![build status](https://api.travis-ci.org/sematext/sematext-agent-docker.svg) 

Sematext Agent for Docker collects Metrics, Events and Logs from the Docker API for [SPM Docker Monitoring](http://sematext.com/spm/integrations/docker-monitoring.html) & [Logsene / Hosted ELK](http://sematext.com/logsene) Log Management. Works with CoreOS, RancherOS, Docker Swarm, Kubernetes, Apache Mesos, Hashicorp Nomad, Amzon ECS, ... see installation. 

_How it works_

Video: [Log Management for Docker](https://www.youtube.com/watch?v=cLKnn1Qbxlc&index=7&list=PLT_fd32OFYpfLBFZz_HiafnqjdlTth1NS)

![Sematext container shipping metrics and logs](https://sematext.files.wordpress.com/2015/12/sematext-agent.png?w=500)

_Gathered information:_

|Type| Description|
|----|------------|
|**Operating System Metrics**| Host machine metrics CPU / Mem / Swap / IO | 
| **Docker Container Metrics/Stats**| CPU Usage, Memory Usage, Network Stats, Disk I/O Stats|
| **Events** |  |
| Agent Startup Event| server-info – created by spm-agent framework with node.js and OS version info on startup
|                               | docker-info – Docker Version, API Version, Kernel Version on startup |
| **Docker Events** | 
| Container Lifecycle Events| create, exec_create, destroy, export, ...|
| Container Runtime Events | die, exec_start, kill, pause, restart, start, stop, unpause, ... |
|**Docker Logs**
| default fields | host / IP address, docker_host, container id, container name, image name,  message|
|  **Log format detection and log parsers**|  NGINX, Apache httpd, Kafka, Solr, HBase, Zookeeper, Cassandra, MySQL, MongoDB, Redis, Elasticsearch, Nsq.io | 
|                | JSON, Plain Text | 

## Installation 

1. Get a free account at [sematext.com/spm](https://apps.sematext.com/users-web/register.do)  
2. [Create an SPM App](https://apps.sematext.com/spm-reports/registerApplication.do) of type "Docker" and copy the SPM Application Token 
   - For logs (optional) [create a Logsene App](https://apps.sematext.com/logsene-reports/registerApplication.do) to obtain an App Token for [Logsene](http://www.sematext.com/logsene/)  
3. Run the image 

   ```docker pull sematext/sematext-agent-docker
docker run -d --name sematext-agent-docker -e SPM_TOKEN=YOUR_SPM_TOKEN -e LOGSENE_TOKEN=YOUR_LOGSENE_TOKEN  -e HOSTNAME  -v /var/run/docker.sock:/var/run/docker.sock sematext/sematext-agent-docker```

    You’ll see your Docker metrics in SPM after about a minute. 

5. Watch metrics, use anomaly detection for alerts, create e-mail reports and [much more ...](http://blog.sematext.com/2015/06/09/docker-monitoring-support/)

![](https://raw.githubusercontent.com/sematext/sematext-agent-docker/master/docker-overview-spm.png)

![](https://raw.githubusercontent.com/sematext/sematext-agent-docker/master/docker-detailed-metrics.png)

Docker Events:
![](https://raw.githubusercontent.com/sematext/sematext-agent-docker/master/docker-events-spm.png)

# Configuration Parameters

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
| LOGAGENT_PATTERNS | Pass patterns.yml via env. variable e.g. ```-e LOGAGENT_PATTERNS="$(cat ./patters.yml)"``` |
| PATTERN_MATCHING_ENABLED | Activate [logagent-js parser](https://sematext.github.io/logagent-js/parser/), default value is ```true```. To disable the log parser set the value to ```false```. This could increase the throughput of log processing for nodes with a very high log volume.|
| -v /yourpatterns/patterns.yml:/etc/logagent/patterns.yml | to provide custom patterns for log parsing, see [logagent-js](https://github.com/sematext/logagent-js)|
| -v /tmp:/logsene-log-buffer | Directory to store logs, in case of a network or service outage. Docker Agent deletes this files after successful transmission.|  
| KUBERNETES | ```1``` enables parsing of container names into the fields kubernetes.pod_name, kubernetes.namespace and kubernetes.container_name |
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

# Installation on CoreOS Linux

Sematext Agent for Docker can monitor CoreOS clusters including metrics and logs from Docker and journald.   
See: [Setup Sematext Agent on CoreOS](https://github.com/sematext/sematext-agent-docker/tree/master/coreos)

# Installation on Kubernetes 

Run Sematext Agent as [Kubernetes DaemonSet](http://kubernetes.io/v1.1/docs/admin/daemons.html).

1. Get a free account at [sematext.com/spm](https://apps.sematext.com/users-web/register.do)  
2. [Create an SPM App](https://apps.sematext.com/spm-reports/registerApplication.do) of type "Docker" and copy the SPM Application Token 
   - For logs (optional) [create a Logsene App](https://apps.sematext.com/logsene-reports/registerApplication.do) to obtain an App Token for [Logsene](http://www.sematext.com/logsene/)
3. Create [sematext-agent.yml](https://github.com/sematext/sematext-agent-docker/blob/master/kubernetes/sematext-agent.yml) - and set your SPM and Logsene App Token in the section spec.env.
4. Run the DaemonSet

```
kubectl create -f sematext-agent.yml 
```

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

# Installation on RancherOS  

Please read [RancherOS Monitoring and Logging Support](https://sematext.com/blog/2016/08/31/rancheros-monitoring-and-logging-support/) there are various deployment options for Rancher, Swarm, Kubernetes or Mesos. 

In addition we recommend to read Rancher Labs blog post about the [RancherOS Catalog Entry](http://rancher.com/new-rancher-community-catalog-monitoring-logging-sematext/). 

# Installation on Nomad by Hashicorp

See and example of the [job description](https://github.com/sematext/sematext-agent-docker/blob/master/hashicorp-nomad/sematext-docker-agent.nomad) for [Nomad by Hashicorp](https://www.nomadproject.io/)

# Installation on Mesos / Marathon

Please note that you have to specify the number of Mesos nodes (instances), SPM App Token and Logsene App Token. Example call to the Marathon API: 

```
curl -XPOST -H "Content-type: application/json" http://your_marathon_server:8080/v2/apps  -d '
{
  "container": {
    "type": "DOCKER",
    "docker": {
      "image": "sematext/sematext-agent-docker"
    },
    "volumes": [
      {
        "containerPath": "/var/run/docker.sock",
        "hostPath": "/var/run/docker.sock",
        "mode": "RW"
      }
    ],
    "network": "BRIDGE"
  },
  "env": {
        "LOGSENE_TOKEN": "YOUR_LOGSENE_TOKEN",
        "SPM_TOKEN": "YOUR_SPM_TOKEN" 
  },
  "id": "sematext-agent",
  "instances": 1,
  "cpus": 0.1,
  "mem": 100,
  "constraints": [
    [
      "hostname",
      "UNIQUE"
    ]
  ]
}
```

# Support

1. Please check the [SPM for Docker Wiki](https://sematext.atlassian.net/wiki/display/PUBSPM/SPM+for+Docker)
2. If you have questions about SPM for Docker, chat with us in the [SPM user interface](https://apps.sematext.com/users-web/login.do) or drop an e-mail to support@sematext.com
3. Open an issue [here](https://github.com/sematext/sematext-agent-docker/issues) 
4. Contribution guide [here](https://github.com/sematext/sematext-agent-docker/blob/master/contribute.md)
