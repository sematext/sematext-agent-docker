# This image is deprecated

Please use [sematext/agent](https://hub.docker.com/r/sematext/agent/) for monitoring and [sematext/logagent](https://hub.docker.com/r/sematext/logagent/) for log  collection. 

Both images are available as Docker certified images: 
- [sematext/agent certified](https://hub.docker.com/_/sematext-agent-monitoring-and-logging)
- [sematext/logagent certified](https://hub.docker.com/_/logagent)

See the following posts for more details: 

- [Better Observability with New Container Agents](https://sematext.com/blog/better-observability-new-container-agents/)
- [Docker Container Monitoring with Sematext](https://sematext.com/blog/docker-container-monitoring-with-sematext/)



# Sematext Agent for Docker

||||
|---|------------|------------|
| [![Sematext Docker Certified](https://sematext.com/wp-content/uploads/2017/07/certified.png)](https://store.docker.com/images/sematext-agent-monitoring-and-logging) | ![build status](https://api.travis-ci.org/sematext/sematext-agent-docker.svg) 

Sematext Agent for Docker collects Metrics, Events and Logs from the Docker API for [Docker Monitoring & Logging](http://sematext.com/docker) & [Hosted Elastic Stack](http://sematext.com/logsene). Works with CoreOS, Rancher, Docker Swarm, Kubernetes, Apache Mesos, Hashicorp Nomad, Amazon ECS, ... see the [installation](http://sematext.com/docs/sematext-docker-agent/installation/). 


# Quickstart 

1. Get [free Sematext account](https://apps.sematext.com/ui/registration)  
2. [Create a Monitoring App](https://apps.sematext.com/ui/integrations) of type "Docker" for Docker metrics. Copy its App Token.  
   Optionally, [create a Logs App](https://apps.sematext.com/ui/integrations)
3. Run the image using individual App tokens for your Monitoring and Logs Apps

   ```
   docker pull sematext/sematext-agent-docker
   docker run -d --name sematext-agent-docker -e SPM_TOKEN=YOUR_SPM_TOKEN -e LOGSENE_TOKEN=YOUR_LOGSENE_TOKEN -v /var/run/docker.sock:/var/run/docker.sock sematext/sematext-agent-docker
   ```

    You’ll see your Docker metrics in [Sematext Cloud](https://sematext.com/cloud) after about a minute. 

5. Watch metrics, search container logs, use anomaly detection for logs and metrics, create email reports and [much more ...](https://sematext.com)

![](https://raw.githubusercontent.com/sematext/sematext-agent-docker/master/sematext-docker-light.png)


# Certified and Public images 

There are several places to obtain Sematext Docker Agent images: 

1. Docker Certified images in [Docker Store](https://store.docker.com/images/sematext-agent-monitoring-and-logging) 

```
docker pull store/sematext/sematext-agent-docker
``` 

2. Red Hat certified images in [Red Hat Container Catalog](https://access.redhat.com/containers/?tab=overview&platform=docker#/registry.connect.redhat.com/sematext/sematext-agent-docker)

```
docker login registry.connect.redhat.com
docker pull registry.connect.redhat.com/sematext/sematext-agent-docker
```

3. Public images from [Docker Hub](https://hub.docker.com/r/sematext/sematext-agent-docker/) 

```
docker pull docker.io/sematext/sematext-agent-docker
```


# Support 

1. [Sematext Docker Agent Homepage](http://sematext.com/docker/)
2. [Sematext Docker Agent Documentation](https://sematext.com/docs/agents/sematext-agent/containers/installation/)
2. Chat with us via [Sematext Cloud UI](https://apps.sematext.com/) or drop an e-mail to support@sematext.com
