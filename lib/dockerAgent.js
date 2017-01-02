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

function parseKubernetesInfo (containerName, k8sInfo) {
  if (!process.env.KUBERNETES) {
    return null
  }
  var fields = containerName.split('_')
  if (fields.length >= 4) {
    // example: k8s_sematext-agent.c56a873d_sematext-agent-qo2yf_default_e94b48c5-e63b-11e5-a8ec-0401b386ea01_8898bc93
    // if (!/k8s/.test(fields[0]) {
    //    return null
    // }
    k8sInfo.kubernetes = {}
    k8sInfo.kubernetes.container_name = fields[1]
    k8sInfo.kubernetes.pod_name = fields[2]
    k8sInfo.kubernetes.namespace = fields[3]
    k8sInfo.kubernetes.uid = fields[4]
    console.log(k8sInfo)
    return k8sInfo
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
            var k8sInfo = parseKubernetesInfo(containerName, {})
            var metric = {
              ts: new Date().getTime(),
              type: 'container',
              filters: [stats.image, containerName],
              name: 'docker',
              value: stats.value,
              sct: 'APP'
            }
            if (k8sInfo && k8sInfo.kubernetes && k8sInfo.kubernetes.pod_name && k8sInfo.kubernetes.container_name) {
              metric.filters = [
                // use  podName + namespace instead of "image name" as filter
                k8sInfo.kubernetes.pod_name + '_' + k8sInfo.kubernetes.namespace,
                // use kuberntes container name instead of docker cotnainer name
                k8sInfo.kubernetes.container_name
              ]
            }
            SpmAgent.Logger.debug(agent.formatLine(metric))
            agent.addMetrics(metric)
          } else {
            var ccMetric = {name: stats.name, type: stats.type, value: stats.value, ts: new Date().getTime(), filters: ['no-filter'], sct: 'APP'}
            // stats.filters=[]
            SpmAgent.Logger.debug(agent.formatLine(ccMetric))
            if (stats.name === 'count') {
              agent.addMetrics(ccMetric)
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

module.exports = dockerAgent
