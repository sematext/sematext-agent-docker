/**
 * @copyright Copyright (c) Sematext Group, Inc. - All Rights Reserved
 *
 * @licence SPM for Docker is free-to-use, proprietary software.
 * THIS IS PROPRIETARY SOURCE CODE OF Sematext Group, Inc. (Sematext)
 * This source code may not be copied, reverse engineered, or altered for any purpose.
 * This source code is to be used exclusively by users and customers of Sematext.
 * Please see the full license (found in LICENSE in this distribution) for details on its license and the licenses of its dependencies.
 */
'use strict'
var monitor = require('./dockerMonitor.js')
var Agent = null
var SpmAgent = null
var DockerEventForwarder = require('./dockerEventForwarder.js')
var Logsene = require('logsene-js')
var dockerInspectCache = require('./dockerInspectCache').dockerInspectCache

// if (!process.env.SPM_TOKEN) {
Agent = require('spm-agent/lib/agent.js')
SpmAgent = require('spm-agent')
// }

function dockerInfo (cb) {
  var Docker = require('dockerode')
  var d = new Docker()
  d.info(function dockerInfoHandler (err, data) {
    if (err) {
      cb(err)
    }
    var result = {_type: 'docker_node_info'}
    result.docker_daemon_id = data.ID
    result.containers = Number(data.Containers)
    result.containers_running = Number(data.ContainersRunning)
    result.containers_paused = Number(data.ContainersPaused)
    result.node_mem_total = Number(data.MemTotal) / (1024 * 1024)
    result.images = Number(data.Images)
    result.node_name = data.Name
    if (data.Swarm) {
      result.swarm_node_id = String(data.Swarm.NodeID)
      result.swarm_nodes = Number(data.Swarm.Nodes)
      result.swarm_managers = Number(data.Swarm.Managers)
    }
    cb(null, result)
  })
}
function logDockerInfo (err, data) {
  if (err) {
    return
  }
  this.logseneLogger.log('info', 'docker info: ' + data.containers_running + ' containers running on node ' + data.node_name,
    data)
}
function dockerAgent () {
  var da = new Agent(
    {
      start: function (agent) {
        var self = this
        // EXPERIMENTAL
        if (process.env.LOGSENE_STATS_TOKEN) {
          console.log('create logsene stats logger')
          this.logseneLogger = new Logsene(process.env.LOGSENE_STATS_TOKEN)
          this.logseneLogger.on('error', function (error) {
            if (error) {
              SpmAgent.Logger.log('Error ' + error.toString())
            }
          })
          dockerInfo(logDockerInfo.bind(self))
          setInterval(function () {
            dockerInfo(logDockerInfo.bind(self))
          }, 60000)
        }
        this.dockerListener = function (stats) {
          if (!stats) {
            return
          }
          if (stats.dockerId) {
            var containerName = stats.dockerId
            if (stats.name) {
              containerName = containerName + '-' + stats.name
            }
            var metric = {
              ts: new Date().getTime(),
              type: 'container',
              filters: [stats.image, containerName],
              name: 'docker',
              value: stats.value,
              sct: 'APP'
            }
            // EXPERIMENTAL
            if (self.logseneLogger) {
              var data = {
                container_id: String(stats.dockerId),
                image_name: String(stats.image),
                container_name: String(stats.name),
                '_type': 'dockerstats'
              }
              for (var i = 0; i < stats.fieldNames.length; i++) {
                data[stats.fieldNames[i]] = Number(stats.value[i])
              }
              var dockerInspect = dockerInspectCache[data.container_id]
              if (dockerInspect) {
                if (dockerInspect.Config && dockerInspect.Config.Hostname) {
                  data.container_hostname = dockerInspect.Config.Hostname
                }
                if (dockerInspect.NetworkSettings && dockerInspect.NetworkSettings.IPAddress) {
                  data.ip = dockerInspect.NetworkSettings.IPAddress
                }
                if (dockerInspect.Config && dockerInspect.Config.Labels && dockerInspect.Config.Labels['com.docker.swarm.node.id']) {
                  data.node_id = dockerInspect.Config.Labels['com.docker.swarm.node.id']
                  data.service_id = dockerInspect.Config.Labels['com.docker.swarm.service.id']
                  data.service_name = dockerInspect.Config.Labels['com.docker.swarm.service.name']
                  data.task_name = dockerInspect.Config.Labels['com.docker.swarm.task.name']
                }
                if (dockerInspect.ServiceID) {
                  data.service_id = dockerInspect.ServiceID
                  data.node_id = dockerInspect.NodeID
                }
                if (dockerInspect.Config && dockerInspect.Config.Labels && dockerInspect.Config.Labels['com.docker.compose.project']) {
                  data.compose_project = dockerInspect.Config.Labels['com.docker.compose.project']
                  data.compose_container_number = dockerInspect.Config.Labels['com.docker.compose.container-number']
                  data.compose_service = dockerInspect.Config.Labels['com.docker.compose.service']
                  if (dockerInspect.Config.Labels['com.docker.swarm.id']) {
                    data.swarm_id = dockerInspect.Config.Labels['com.docker.swarm.id']
                  }
                }
              }
              self.logseneLogger.log('info',
                'stats for container ' + stats.name + ' ' + stats.dockerId,
                data)
            }
            if (SpmAgent) {
              SpmAgent.Logger.debug(agent.formatLine(metric))
              agent.addMetrics(metric)
            }
          } else {
            var ccMetric = {name: stats.name, type: stats.type, value: stats.value, ts: new Date().getTime(), filters: ['no-filter'], sct: 'APP'}
            // stats.filters=[]
            if (SpmAgent) {
              SpmAgent.Logger.debug(agent.formatLine(ccMetric))
              if (stats.name === 'count') {
                agent.addMetrics(ccMetric)
              }
              if (stats.name === 'totalcpu') {
                agent.addMetrics(ccMetric)
              }
            }
          }
        }
        if (process.env.LOGSENE_STATS_TOKEN || SpmAgent && SpmAgent.Config.tokens.spm) {
          monitor(this.dockerListener)
        } else {
          if (!process.env.LOGSENE_STATS_TOKEN) {
            console.log('SPM_TOKEN is missing, no metrics will be collected')
          } else {
            console.log('Metrics metrics will be collected in Logsene!')
          }
        }
      },
      stop: function () {
        // TODO: stop streaming docker stats, terminate timer
      },
      eventForwarder: new DockerEventForwarder()
    }
  )
  return da
}

module.exports = dockerAgent
