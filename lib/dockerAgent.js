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
var SwarmTaskMonitor = require('./swarmTaskMonitor')
var swarmTaskMonitor = null
// if (!process.env.SPM_TOKEN) {
Agent = require('spm-agent/lib/agent.js')
SpmAgent = require('spm-agent')
// }
var LinuxAgent = require('./linuxAgent.js')
var linuxAgent = LinuxAgent()

var nodeId = null
var isSwarmMaster = false
function dockerInfo (cb) {
  var Docker = require('dockerode')
  var d = new Docker()
  d.info(function dockerInfoHandler (err, data) {
    if (err) {
      cb(err)
    }
    var result = {_type: 'dockerNodeInfo'}
    result.CPUs = Number(result.CPUs) || 1
    result.docker_daemon_id = data.ID
    result.containers = Number(data.Containers)
    result.containers_running = Number(data.ContainersRunning)
    result.containers_paused = Number(data.ContainersPaused)
    result.node_mem_total = Number(data.MemTotal) / (1024 * 1024)
    result.images = Number(data.Images)
    result.node_name = data.Name
    if (data.Swarm) {
      nodeId = String(data.Swarm.NodeID)
      result.swarm_node_id = String(data.Swarm.NodeID)
      result.swarm_nodes = Number(data.Swarm.Nodes)
      result.swarm_managers = Number(data.Swarm.Managers)
      result.swarm_is_master = String(data.Swarm.ControlAvailable) || 'false'
      isSwarmMaster = result.swarm_is_master
    }
    cb(null, result)
  })
}

function startTaskMonitor (logseneStatsLogger) {
  if (!isSwarmMaster || swarmTaskMonitor != null) {
    return
  }
  swarmTaskMonitor = new SwarmTaskMonitor()
  swarmTaskMonitor.on('taskMetrics', function logTaskMetrics (taskMetrics) {
    logseneStatsLogger.log('info', 'swarm task metrics', taskMetrics)
  })
  swarmTaskMonitor.on('taskError', function logTaskMetrics (task) {
    task._type = 'taskError'
    logseneStatsLogger.log('error', 'Error in swarm task: ' + task.status.message + ' / ' + task.status.error, task)
  })
  swarmTaskMonitor.start()
}
function logDockerInfo (err, data) {
  if (err) {
    return
  }
  startTaskMonitor(this.logseneLogger)
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
          var osagent = {
            addMetrics: function (osmetrics) {
              if (/null/.test(JSON.stringify(osmetrics))) {
                return
              }
              osmetrics._type = 'os'
              osmetrics.hostname = process.env.SPM_REPORTED_HOSTNAME
              if (nodeId) {
                osmetrics.node_id = nodeId
              }
              self.logseneLogger.log(
                'info',
                'os stats for ' + process.env.SPM_REPORTED_HOSTNAME,
                osmetrics)
            }
          }
          linuxAgent.start(osagent)
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
              _type: 'container',
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
                '_type': 'dockerStats',
                container: {}
              }
              for (var i = 0; i < stats.fieldNames.length; i++) {
                data.container[stats.fieldNames[i].replace(/\./g, '_')] = Number(stats.value[i])
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
                  data.swarm = {
                    node_id: dockerInspect.Config.Labels['com.docker.swarm.node.id'],
                    service_id: dockerInspect.Config.Labels['com.docker.swarm.service.id'],
                    service_name: dockerInspect.Config.Labels['com.docker.swarm.service.name'],
                    task_name: dockerInspect.Config.Labels['com.docker.swarm.task.name']
                  }
                }
                if (dockerInspect.NodeID) {
                  if (!data.swarm) {
                    data.swarm = {}
                  }
                  data.swarm.node_id = dockerInspect.NodeID
                  if (dockerInspect.ServiceID) {
                    data.swarm.service_id = dockerInspect.ServiceID
                  }
                }
                if (dockerInspect.Config && dockerInspect.Config.Labels && dockerInspect.Config.Labels['com.docker.compose.project']) {
                  data.compose = {
                    project: dockerInspect.Config.Labels['com.docker.compose.project'],
                    container_number: dockerInspect.Config.Labels['com.docker.compose.container-number'],
                    service: dockerInspect.Config.Labels['com.docker.compose.service']
                  }
                }
              }
              self.logseneLogger.log('stats',
                'stats for container ' + stats.name + ' ' + stats.dockerId,
                data)
            }
            if (process.env.SPM_TOKEN) {
              SpmAgent.Logger.debug(agent.formatLine(metric))
              agent.addMetrics(metric)
            }
          } else {
            if (stats.name === 'totalcpu') {
              if (self.logseneLogger) {
                self.logseneLogger.log('stats',
                  'stats for container ' + stats.name + ' ' + stats.dockerId,
                  {containers_total_cpu_per_host: stats.value, _type: 'containerStats'})
              }
            }
            var ccMetric = {name: stats.name, type: stats.type, value: stats.value, ts: new Date().getTime(), filters: ['no-filter'], sct: 'APP'}
            // stats.filters=[]
            if (process.env.SPM_TOKEN) {
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
