/*
 * @copyright Copyright (c) Sematext Group, Inc. - All Rights Reserved
 *
 * @licence SPM for NodeJS is free-to-use, proprietary software.
 * THIS IS PROPRIETARY SOURCE CODE OF Sematext Group, Inc. (Sematext)
 * This source code may not be copied, reverse engineered, or altered for any purpose.
 * This source code is to be used exclusively by users and customers of Sematext.
 * Please see the full license (found in LICENSE in this distribution) for details on its license and the licenses of its dependencies.
 */
'use strict'
var SpmAgent = require('spm-agent')
var Agent = SpmAgent.Agent
var config = SpmAgent.Config
var logger = SpmAgent.Logger
var os = require('os')
var cluster = require('cluster')
var linux = require('./linuxMetrics.js')
var lastValues = {}

function calcDiff (name, value) {
  var diff = 0
  if (!lastValues[name]) {
    lastValues[name] = Number(value)
  }
  diff = value - lastValues[name]
  lastValues[name] = value
  return diff
}
/**
 * This module generates Linux-OS Metrics. Names are compatible with collectd. SpmSender uses collectd format for OS Metrics
 * @returns {Agent}
 */
module.exports = function () {
  var linuxAgent = new Agent(
    {
      start: function (agent) {
        this.isLinux = (os.platform() === 'linux')
        var self = this
        var cpuLastValues = {}
        os.cpus().forEach(function (cpu, i) {
          cpuLastValues[i] = {idle: 0, user: 0, sys: 0, irq: 0, nice: 0, wait: 0, softirq: 0, stolen: 0}
        })
        // var cpuProperties = ['user', 'nice', 'irq', 'sys', 'idle', 'wait', 'softirq', 'stolen']
        var cpuProperties = ['user', 'nice', 'irq', 'system', 'idle', 'iowait', 'softirq', 'steal']
        if (cluster.isMaster) {
          var timerId = setInterval(function () {
            var time = new Date().getTime()
            var metrics = {}
            metrics['collectd-sys-load'] = os.loadavg()
            metrics['collectd-mem-free'] = os.freemem()
            metrics['collectd-mem-used'] = os.totalmem() - os.freemem()
            if (self.isLinux) {
              linux.df(function dfMetrics (err, data) {
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
              linux.vmstat(function (err, vmstat) {
                SpmAgent.Logger.debug('vmstat ', vmstat)
                if (err) {
                  SpmAgent.Logger.error('error calling vmstat ' + err)
                  return
                }
                metrics['collectd-mem-cach'] = vmstat.cache * 1024
                metrics['collectd-swap-used'] = vmstat.swapd * 1024
                metrics['collectd-swap-in'] = vmstat.si
                metrics['collectd-swap-out'] = vmstat.so
                metrics['collectd-swap-in'] = vmstat.si
                metrics['collectd-swap-out'] = vmstat.so
                linux.vmstatS(function (err, vmstats) {
                  if (err) {
                    SpmAgent.Logger.error('error calling vmstat ' + err)
                    return
                  }
                  metrics['collectd-mem-free'] = vmstats.memory.free * 1024
                  metrics['collectd-mem-buff'] = vmstats.memory.buffer * 1024
                  // metrics['collectd-mem-inactive'] = vmstats.memory.inactive
                  // metrics['collectd-mem-active'] = vmstats.memory.active
                  metrics['collectd-mem-used'] = (vmstats.memory.used - (vmstats.memory.buffer + vmstat.cache)) * 1024
                  if (vmstats.disks) {
                    try {
                      vmstats.disks.forEach(function (disk) {
                        metrics['collectd-io-octets\tdisk-' + disk.device + '/disk_octets'] = (calcDiff(disk.device + 'sectors_read', disk.sectors_read) * 512) + ',' + (calcDiff(disk.device + 'sectors_written', disk.sectors_written) * 512)
                      })
                    } catch(diskInfoErr) {
                      console.log(diskInfoErr)
                    }
                  }
                  var cpuTotal = 0
                  // we get summary of all cpu's so in collectd we send cpu-0
                  var i = 0
                  cpuProperties.forEach(function (property) {
                    // console.log ('CPU ' + property + ' ' + vmstats.cpu [property])
                    if (isNaN(Number(cpuLastValues[i][property]))) {
                      cpuLastValues[i][property] = 0
                    }
                    cpuLastValues[i][property] = Number(vmstats.cpu[property]) - Number(cpuLastValues[i][property])
                    cpuTotal = Number(cpuTotal) + Number(cpuLastValues[i][property])
                  })
                  metrics['collectd-cpu-usr\tcpu-' + i + '/cpu-user'] = (cpuLastValues[i].user / cpuTotal) * 100
                  metrics['collectd-cpu-nic\tcpu-' + i + '/cpu-nice'] = (cpuLastValues[i].nice / cpuTotal) * 100
                  metrics['collectd-cpu-sys\tcpu-' + i + '/cpu-system'] = (cpuLastValues[i].system / cpuTotal) * 100
                  metrics['collectd-cpu-idl\tcpu-' + i + '/cpu-idle'] = (cpuLastValues[i].idle / cpuTotal) * 100
                  metrics['collectd-cpu-int\tcpu-' + i + '/cpu-interrupt'] = (cpuLastValues[i].irq / cpuTotal) * 100
                  metrics['collectd-cpu-ste\tcpu-' + i + '/cpu-steal'] = (cpuLastValues[i].steal / cpuTotal) * 100
                  metrics['collectd-cpu-sir\tcpu-' + i + '/cpu-softirq'] = (cpuLastValues[i].softirq / cpuTotal) * 100
                  metrics['collectd-cpu-wait\tcpu-' + i + '/cpu-wait'] = (cpuLastValues[i].iowait / cpuTotal) * 100
                  // setting "sct" parameter for spm-sender to use specific collectd format when transmitting to receiver.
                  for (var x in metrics) {
                    agent.addMetrics({ts: time, name: x, value: metrics[x], sct: 'OS'})
                  }
                })
              })
            }
          }, config.collectionInterval || 30000)
          if (timerId.unref) {
            timerId.unref()
          }
        }
      }
    }
  )
  return linuxAgent
}
