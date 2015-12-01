# Contributing

First off, thanks for taking the time to contribute! 

We encourage users to open issues, because it's impossible to test everything on all platforms - so please let us know if something goes wrong or if you need enhancements. 

If you are developer and like to contribute to this repository, please fork it and create a pull request. 

The following section provides information to setup the test environment (assuming you know already git, node.js and Docker).

## Building your own sematext-agent-docker image 

SPM for Docker is implemented in node.js and this package provides an executable "sematext-agent-docker".
It could run directly on the Docker host, for example to test a new version during development. 
We like to make deployment easy and wrap node.js (actually io.js) and the scripts from this repository into a docker image (see Dockerfile and run.sh in this repository) - published on docker hub labeled as [sematext/sematext-agent-docker](https://registry.hub.docker.com/u/sematext/sematext-agent-docker/).

To install sematext-agent-docker use
```
npm i sematext/sematext-agent-docker -g 
```
Please note this module is not published on npm, because it should be used with the docker image. 

## Running the node.js agent 

```
sematext-agent-docker YOUR-SPM-APP-TOKEN-HERE
```

## Permissions and security

sematext-agent-docker needs access to the docker unix socket (default: /var/run/docker.sock).

```
sudo sematext-agent-docker YOUR-SPM-APP-TOKEN-HERE
```

We recommend to run spm-docker on a user account, belonging to the 'docker' group. 
Please refer to the instructions for your operating system, e.g.:
The docker install instructions for Debian: https://docs.docker.com/installation/debian/

```
# Add the docker group if it doesn't already exist.
$ sudo groupadd docker

# Add the connected user "${USER}" to the docker group.
# Change the user name to match your preferred user.
# You may have to logout and log back in again for
# this to take effect.
$ sudo gpasswd -a ${USER} docker

# Restart the Docker daemon.
$ sudo service docker restart
```

## Build the docker image from sources

The source directory contains the [Dockerfile](https://github.com/sematext/sematext-agent-docker/blob/master/Dockerfile) and the runner script [run.sh](https://github.com/sematext/sematext-agent-docker/blob/master/run.sh)

```
sudo docker build -t sematext/sematext-agent-docker-local .
```

## Running SPM Agent for Docker as docker container

```
docker run  -d -e SPM_TOKEN=76349b1d-XXXX-XXXX-XXXX-812f0fe85699 -e HOSTNAME=$HOSTNAME -v /var/run/docker.sock:/var/run/docker.sock sematext/sematext-agent-docker-local
```


