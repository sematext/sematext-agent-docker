
# Sematext Docker Agent

[![Sematext Docker ETP partner for Logging](https://sematext.files.wordpress.com/2015/12/docker_etp_program_logo_square.png?w=125&h=124)](http://blog.sematext.com/2015/12/15/docker-logging-partner-sematext-logsene/) 
[![Deploy to Docker Cloud](https://files.cloud.docker.com/images/deploy-to-dockercloud.svg)](https://cloud.docker.com/stack/deploy/?repo=https://github.com/sematext/sematext-agent-docker)
[![Deploy to Tutum](https://s.tutum.co/deploy-to-tutum.svg)](https://dashboard.tutum.co/stack/deploy/?repo=https://github.com/sematext/sematext-agent-docker) 
![build status](https://api.travis-ci.org/sematext/sematext-agent-docker.svg) 

Sematext Docker Agent collects Metrics, Events and Logs from the Docker API for [SPM Docker Monitoring](http://sematext.com/spm/integrations/docker-monitoring.html) & [Logsene / Hosted ELK](http://sematext.com/logsene) Log Management. Works with CoreOS, RancherOS, Docker Swarm, Kubernetes, Apache Mesos, Hashicorp Nomad, Amzon ECS, ... see installation. 

_How it works_

Video: [Log Management for Docker](https://www.youtube.com/watch?v=cLKnn1Qbxlc&index=7&list=PLT_fd32OFYpfLBFZz_HiafnqjdlTth1NS)

![Sematext container shipping metrics and logs](https://sematext.files.wordpress.com/2015/12/sematext-agent.png?w=500)

_Gathered information:_
- **Operating System Metrics** of the Host machine (CPU / Mem / Swap/ ...) 
- **Docker Container Metrics/Stats**
	- CPU Usage
	- Memory Usage
	- Network Stats
	- Disk I/O Stats
- **Docker Events**
    - Version Information on Startup:
        - server-info – created by spm-agent framework with node.js and OS version info on startup
        - docker-info – Docker Version, API Version, Kernel Version on startup
    - Docker Events:
        - Container Lifecycle Events like
            - create, exec_create, destroy, export
        - Container Runtime Events like
            - die, exec_start, kill, pause, restart, start, stop, unpause, ...
- **Docker Logs**
  - default fields
	- hostname / IP address
	- container id
	- container name
	- image name
	- message
  - **Log format detection and log parsers:** 
		- NGINX
		- Apache httpd, Kafka, Solr, HBase, Zookeeper, Cassandra
		- MySQL
		- MongoDB
		- Redis
		- Elasticsearch
		- Nsq.io
		- JSON, ... 

## Installation 

1. Get a free account at [sematext.com/spm](https://apps.sematext.com/users-web/register.do)  
2. [Create an SPM App](https://apps.sematext.com/spm-reports/registerApplication.do) of type "Docker" and copy the SPM Application Token 
   - For logs (optional) [create a Logsene App](https://apps.sematext.com/logsene-reports/registerApplication.do) to an App Token for [Logsene](http://www.sematext.com/logsene/)  
3. Run the image 
	```
	docker pull sematext/sematext-agent-docker
	docker run -d --name sematext-agent-docker -e SPM_TOKEN=YOUR_SPM_TOKEN -e LOGSENE_TOKEN=YOUR_LOGSENE_TOKEN  -e HOSTNAME  -v /var/run/docker.sock:/var/run/docker.sock sematext/sematext-agent-docker
	# Alternative TCP: default TCP 2375 on 'localhost' (=> container gateway address), -v is not required
	docker run -d --name sematext-agent-docker -e SPM_TOKEN=YOUR_SPM_TOKEN -e LOGSENE_TOKEN=YOUR_LOGSENE_TOKEN  -e HOSTNAME  sematext/sematext-agent-docker
	```

	**Required Parameters:**
	- -e SPM_TOKEN - SPM Application Token
	- -e HOSTNAME - name of the docker host e.g. '$HOSTNAME' for Amazon ECS see HOSTNAME_LOOKUP_URL 
	- -v /var/run/docker.sock - path to the docker socket (optional, if dockerd provides TCP on 2375, see also DOCKER_PORT and DOCKER_HOST paramter)
	
	**TCP and TLS connection (> image version 1.29.13)**

	If the unix socket is not available Sematext Agent assumes the Container Gateway Address (autodetect) and port 2375 as default (no TLS) - this needs no configuration. In case the Docker Daemon TCP settings are different, you have to configure the TCP settings. The TCP settings can be modified with the following parameters:

  - -e DOCKER_HOST - e.g. tcp://ip-reachable-from-container:2375/ - if not set unix:///var/run/docker.sock or if this does not exists tcp://gateway:2375 will be used. In this case you don't need -v to mount /var/run/docker.sock
	- -e DOCKER_PORT - in case Docker TCP connection is used, the agent will use its gateway address (autodetect) with the given DOCKER_PORT
  - -e DOCKER_TLS_VERIFY - 0 or 1
  - -e DOCKER_CERT_PATH - path to your certificate files, mount the path to the countainer with "-v $DOCKER_CERT_PATH:$DOCKER_CERT_PATH"  

  Example using docker-machine with [Docker Swarm](https://github.com/sematext/sematext-agent-docker/blob/master/README.md#installation-on-docker-swarm): 
  ```
  docker-machine env --swarm swarm-master
  export DOCKER_TLS_VERIFY="1"
  export DOCKER_HOST="tcp://192.168.99.101:3376"
  export DOCKER_CERT_PATH="/Users/stefan/.docker/machine/machines/swarm-master"
  export DOCKER_MACHINE_NAME="swarm-master"
  eval "$(docker-machine env swarm-master)"
  docker run -d --name sematext-agent --restart=always -e SPM_TOKEN=MY_TOKEN -e HOSTNAME  -e DOCKER_TLS_VERIFY -e DOCKER_CERT_PATH -e DOCKER_HOST -v $DOCKER_CERT_PATH:$DOCKER_CERT_PATH sematext/sematext-agent-docker
  ```

	**Optional Parameters:**
	- --privileged  might be required for Security Enhanced Linux (the better way is to have the right policy ...)
	- -e HOSTNAME_LOOKUP_URL - On Amazon ECS, a [metadata query](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html) must be used to get the instance hostname (e.g. "169.254.169.254/latest/meta-data/local-hostname")
	- -e HTTPS_PROXY - URL for a proxy server (behind firewalls)
  - -e LOGSENE_URL - URL for bulk inserts into Logsene. The default value is https://logsene-receiver.sematext.com/_bulk". This URL must be changed in case you use Logsene On-Premises. 
  - -e SPM_URL - URL for bulk inserts into SPM. This URL must be changed in case you use Logsene On-Premises. 
        **Docker Logs Parameters:**
	- -e LOGSENE_TOKEN - Logsene Application Token for logs 
	- Whitelist containers for logging
	  - -e MATCH_BY_NAME - regular expression to white list container names 
	  - -e MATCH_BY_IMAGE - regular expression to white list image names 
	- Blacklist containers
	  - -e SKIP_BY_NAME - regular expression to black list container names 
	  - -e SKIP_BY_IMAGE - regular expression to black list image names for logging 
	  - -v /yourpatterns/patterns.yml:/etc/logagent/patterns.yml - to provide custom patterns for log parsing, see [logagent-js](https://github.com/sematext/logagent-js)
    - -v /tmp:/logsene-log-buffer a directory to store logs, in case of a network or service outage. Docker Agent deletes this files after successful transmission.  
	- -e KUBERNETES set this variable to "1" to parse container names into the fields kubernetes.pod_name, kubernetes.namespace and kubernetes.container_name


	You’ll see your Docker metrics in SPM after about a minute.
	
5. Watch metrics, use anomaly detection for alerts, create e-mail reports and [much more ...](http://blog.sematext.com/2015/06/09/docker-monitoring-support/)

![](https://raw.githubusercontent.com/sematext/sematext-agent-docker/master/docker-overview-spm.png)

![](https://raw.githubusercontent.com/sematext/sematext-agent-docker/master/docker-detailed-metrics.png)

Docker Events:
![](https://raw.githubusercontent.com/sematext/sematext-agent-docker/master/docker-events-spm.png)

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

To use a custom pattern definition simply mount a volume to '/etc/logagent/patterns.yml':
```
-v /mydir/patterns.yml:/etc/logagent/patterns.yml
```

Feel free to contribute to [logagent-js](https://github.com/sematext/logagent-js) to enrich the default pattern set. 

# Installation on CoreOS Linux

Sematext Agent for Docker can monitor CoreOS clusters including metrics and logs from Docker and journald.   
See: [Setup Sematext Docker Agent on CoreOS](https://github.com/sematext/sematext-agent-docker/tree/master/coreos)

# Installation on Kubernetes 

Run Sematext Docker Agent as [Kubernetes DaemonSet](http://kubernetes.io/v1.1/docs/admin/daemons.html).

1. Create [sematext-agent.yml](https://github.com/sematext/sematext-agent-docker/blob/master/kubernetes/sematext-agent.yml) - and set your SPM and Logsene App Token in the section spec.env.
2. Run the DaemonSet

```
kubectl create -f sematext-agent.yml --validate=false
```

# Installation on Docker Swarm 

Please read [Docker Swarm: Collecting Metrics, Events & Logs](http://blog.sematext.com/2016/01/12/docker-swarm-collecting-metrics-events-logs/)

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
