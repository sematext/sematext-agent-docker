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
var Agent = require('spm-agent/lib/agent.js')
var SpmAgent = require('spm-agent')
var DockerEventForwarder = require('./dockerEventForwarder.js')
var containerCount = 0
var POD = /^POD$/
var ignoreImageVersion = !(process.env.IGNORE_IMAGE_VERSION === 'false')
global.spmSenderUrlParameters = '&containerCount=' + containerCount

function parseKubernetesInfo (containerName, k8sInfo) {
  // containers managed by Kubernetes have a prefix "k8s_", reference:
  // https://github.com/kubernetes/kubernetes/blob/f5d9c430e9168cf5c41197b8a4e457981cb031df/pkg/kubelet/dockertools/docker.go#L85
  if (!/k8s_/.test(containerName)) {
    return null
  }
  var fields = containerName.split('_')
  if (fields.length >= 4) {
    // example: k8s_sematext-agent.c56a873d_sematext-agent-qo2yf_default_e94b48c5-e63b-11e5-a8ec-0401b386ea01_8898bc93
    k8sInfo.kubernetes = {}
    k8sInfo.kubernetes.container_name = fields[1]
    k8sInfo.kubernetes.pod_name = fields[2]
    k8sInfo.kubernetes.namespace = fields[3]
    k8sInfo.kubernetes.uid = fields[4]
    return k8sInfo
  } else {
    return null
  }
}

function parseSwarmInfo (containerName, swarmInfo) {
  // Format: ID-swarmServiceName.ContainerNumber.TaskId
  if (!/\S{12}-\S+\.\d+\.\S+/.test(containerName)) {
    return null
  }
  var fields = containerName.split('.')
  if (fields.length === 3) {
    // remove ID with 13 characters
    if (fields[0]) {
      var idLength = containerName.indexOf('-')
      swarmInfo.service_name = fields[0].substring(idLength + 1, fields[0].length)
    }
    swarmInfo.container_number = fields[1]
    swarmInfo.task_id = fields[2]
    return swarmInfo
  } else {
    return null
  }
}

function dockerAgent () {
  var da = new Agent(
    {
      start: function (agent) {
        this.dockerListener = function (stats) {
          if (!stats) {
            return
          }
          if (stats.dockerId) {
            var containerName = stats.dockerId
            if (stats.name) {
              containerName = containerName + '-' + stats.name
            }
            var imageName = stats.image
            if (ignoreImageVersion && imageName) {
              imageName = imageName.split(':')[0]
            }
            var metric = {
              ts: new Date().getTime(),
              type: 'container',
              filters: [imageName, containerName],
              name: 'docker',
              value: stats.value,
              sct: 'APP'
            }
            var k8sInfo = parseKubernetesInfo(containerName, {})
            var swarmInfo = null
            if (!k8sInfo) {
              // check Docker Swarm
              swarmInfo = parseSwarmInfo(containerName, {})
            }

            if (k8sInfo && k8sInfo.kubernetes && k8sInfo.kubernetes.pod_name && k8sInfo.kubernetes.container_name && k8sInfo.kubernetes.uid) {
              // GKE does not report k8s.container_name, we find instead a static string "POD"
              if (POD.test(k8sInfo.kubernetes.container_name)) {
                // use docker containerID-containerName
                k8sInfo.kubernetes.container_name = containerName
              }
              metric.filters = [
                // use  podName + namespace instead of "image name" as filter
                k8sInfo.kubernetes.pod_name + '_' + k8sInfo.kubernetes.namespace,
                // use kubernetes container name + uid to have a unique identifier
                k8sInfo.kubernetes.container_name + '_' + k8sInfo.kubernetes.uid
              ]
            }
            if (swarmInfo && swarmInfo.service_name) {
              metric.filters = [
                // aggregate by service instead of image_name
                swarmInfo.service_name,
                // use full container name
                containerName
              ]
            }

            SpmAgent.Logger.debug(agent.formatLine(metric))
            agent.addMetrics(metric)
          } else {
            var ccMetric = {name: stats.name, type: stats.type, value: stats.value, ts: new Date().getTime(), filters: ['no-filter'], sct: 'APP'}
            SpmAgent.Logger.debug(agent.formatLine(ccMetric))
            if (stats.name === 'count') {
              agent.addMetrics(ccMetric)
              if (containerCount === 0) {
                // init
                containerCount = stats.value
                global.spmSenderUrlParameters = '&containerCount=' + containerCount
              }
              containerCount = stats.value
              SpmAgent.Logger.debug('container count = ' + stats.value)
            }
            if (stats.name === 'totalcpu') {
              agent.addMetrics(ccMetric)
            }
          }
        }
        if (SpmAgent.Config.tokens.spm) {
          monitor(this.dockerListener)
        } else {
          console.log('SPM_TOKEN is missing, no metrics will be collected')
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
setInterval(function () {
  global.spmSenderUrlParameters = '&containerCount=' + containerCount
}, 30000)

module.exports = dockerAgent
