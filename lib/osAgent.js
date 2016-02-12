/*
 * @copyright Copyright (c) Sematext Group, Inc. - All Rights Reserved
 *
 * @licence SPM Agent for NodeJS is free-to-use, proprietary software.
 * THIS IS PROPRIETARY SOURCE CODE OF Sematext Group, Inc. (Sematext)
 * This source code may not be copied, reverse engineered, or altered for any purpose.
 * This source code is to be used exclusively by users and customers of Sematext.
 * Please see the full license (found in LICENSE in this distribution) for details on its license and the licenses of its dependencies.
 */
'use strict'
var SpmAgent = require('spm-agent')
var Agent = SpmAgent.Agent
var config = SpmAgent.Config
var os = require('os')
var cluster = require('cluster')
var diskfree = require('node-df')
var logger = SpmAgent.Logger
/**
 * This module generates OS Metrics. Names are compatible with collectd. SpmSender uses collectd format
 * @returns {Agent}
 */
module.exports = function () {
  if (os.platform() === 'linux') {
    try {
      var LinuxAgent = require('./linuxAgent.js')
      var lAgent = new LinuxAgent()
      return lAgent
    } catch (err) {
      SpmAgent.Logger.error('Cannot initialize linux agent:' + err)
    }
  }
  var osAgent = new Agent(
    {
      diskFree: function (agent) {
        if (os.platform() !== 'darwin') {
          return
        }
        diskfree(function dfMetrics (err, data) {
          if (err) {
            return logger.error('Error in df() for disk-usage metrics:' + err)
          }
          if (data && data.length > 0) {
            data.forEach(function (disk) {
            if (/\/dev\/.+/i.test(disk.filesystem)) {
              var dev = disk.filesystem.split('/')[2]
              var usedName = 'collectd5-disk-space-used\tdf-' + dev + '/df_complex-used'
              var usedValue = disk.used * 1024
              var freeName = 'collectd5-disk-space-free\tdf-' + dev + '/df_complex-free'
              var freeValue = disk.available * 1024
              agent.addMetrics({
                ts: Date.now(),
                name: usedName,
                value: usedValue,
                sct: 'OS'
              })
              agent.addMetrics({
                ts: Date.now(),
                name: freeName,
                value: freeValue,
                sct: 'OS'
              })
            }
          })
          }
        })
      },
      start: function (agent) {
        var self = this
        var cpuLastValues = {}
        os.cpus().forEach(function (cpu, i) {
          cpuLastValues[i] = {idle: 0, user: 0, sys: 0, irq: 0, nice: 0}
        })
        var cpuProperties = ['user', 'nice', 'irq', 'sys', 'idle']
        if (cluster.isMaster) {
          var timerId = setInterval(function () {
            var time = new Date().getTime()
            var metrics = {}
            self.diskFree(agent)
            metrics['collectd-sys-load'] = os.loadavg()
            metrics['collectd-mem-free'] = os.freemem()
            metrics['collectd-mem-used'] = os.totalmem() - os.freemem()
            os.cpus().forEach(function (cpu, i) {
              var cpuTotal = 0
              cpuProperties.forEach(function (property) {
                cpuLastValues[i][property] = cpu.times[property] - cpuLastValues[i][property]
                cpuTotal = cpuTotal + cpuLastValues[i][property]
              })
              metrics['collectd-cpu-usr\tcpu-' + i + '/cpu-user'] = (cpuLastValues[i].user / cpuTotal) * 100
              metrics['collectd-cpu-nic\tcpu-' + i + '/cpu-nice'] = (cpuLastValues[i].nice / cpuTotal) * 100
              metrics['collectd-cpu-sys\tcpu-' + i + '/cpu-system'] = (cpuLastValues[i].sys / cpuTotal) * 100
              metrics['collectd-cpu-idl\tcpu-' + i + '/cpu-idle'] = (cpuLastValues[i].idle / cpuTotal) * 100
              metrics['collectd-cpu-int\tcpu-' + i + '/cpu-interrupt'] = (cpuLastValues[i].irq / cpuTotal) * 100
              // We can't get this values from node.js standard API
              metrics['collectd-cpu-ste\tcpu-' + i + '/cpu-steal'] = 0.0001
              metrics['collectd-cpu-sir\tcpu-' + i + '/cpu-softirq'] = 0.0001
              metrics['collectd-cpu-wait\tcpu-' + i + '/cpu-wait'] = 0.0001
            })
            // setting "sct" parameter for spm-sender to use specific collectd format when transmitting to receiver.
            for (var x in metrics) {
              agent.addMetrics({ts: time, name: x, value: metrics[x], sct: 'OS'})
            }
          }, config.collectionInterval || 30000)
          if (timerId.unref) {
            timerId.unref()
          }
        }
      }
    }
  )
  return osAgent
}
