/*
 * @copyright Copyright (c) Sematext Group, Inc. - All Rights Reserved
 *
 * @licence Sematext Agent for OS Metrics is free-to-use, proprietary software.
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
  var cpuLastValues = {}
  var linuxAgent = new Agent({
    start: function (agent) {
      this.isLinux = (os.platform() === 'linux')
      this.agent = agent
      if (cluster.isMaster || process.env.NODE_APP_INSTANCE === 0 || process.env.SPM_MASTER_MODE === 1) {
        var timerId = setInterval(function () {
          var time = Date.now()
          var load = os.loadavg()
          var loadAvg1min = 0
          if (load && load.length > 0) {
            loadAvg1min = load[0]
          }
          agent.addMetrics({ts: time, type: 'os', name: 'oslo', filters: '', value: [loadAvg1min], sct: 'OS'})
          if (this.isLinux) {
            cpuLastValues['cpu'] = {idle: 0, user: 0, system: 0, irq: 0, nice: 0, iowait: 0, softirq: 0, steal: 0, total: 0}

            linux.cpuStats(function (cpu) {
              if (!cpu || !cpu.cpu) {
                return
              }
              var cpuProperties = ['user', 'nice', 'irq', 'system', 'idle', 'iowait', 'softirq', 'steal']

              var key = 'cpu'
              cpuProperties.forEach(function (property) {
                cpuLastValues[key][property] = calcDiff(key + property, Number(cpu[key][property]))
                cpuLastValues[key]['total'] = Number(cpuLastValues[key]['total']) + Number(cpuLastValues[key][property])
              })
              var cpuTotal = cpuLastValues[key]['total']
              var oscpu = {
                '@timestamp': time,
                type: 'os',
                oscpu: {
                  user: (cpuLastValues[key].user / cpuTotal) * 100,
                  nice: (cpuLastValues[key].nice / cpuTotal) * 100,
                  system: (cpuLastValues[key].system / cpuTotal) * 100,
                  idle: (cpuLastValues[key].idle / cpuTotal) * 100,
                  iowait: (cpuLastValues[key].iowait / cpuTotal) * 100,
                  irq: (cpuLastValues[key].irq / cpuTotal) * 100,
                  softirq: (cpuLastValues[key].softirq / cpuTotal) * 100,
                  steal: (cpuLastValues[key].steal / cpuTotal) * 100,
                  total: 0
                }
              }
              oscpu.oscpu.total = oscpu.oscpu.user + oscpu.oscpu.nice + oscpu.oscpu.system + oscpu.oscpu.iowait + oscpu.oscpu.irq + oscpu.oscpu.softirq + oscpu.oscpu.steal
              if (!/null/.test(JSON.stringify(oscpu))) {
                agent.addMetrics(oscpu)
              }
            })

            linux.networkStats(function (data) {
              if (data) {
                data.forEach(function (netStat) {
                  if (netStat.bytes && netStat.Interface) {
                    agent.addMetrics({
                      type: 'os',
                      osnet: {
                        interface: netStat.Interface || 'unknown',
                        tx_bytes: calcDiff(netStat.Interface + 'tx', Number(netStat.bytes.Transmit)),
                        rx_bytes: calcDiff(netStat.Interface + 'rx', Number(netStat.bytes.Receive))
                      }
                    })
                  }
                })
              }
            })

            linux.df(function dfMetrics (err, data) {
              if (err) {
                return logger.error('Error in df() for disk-usage metrics:' + err)
              }
              if (data && data.length > 0) {
                data.forEach(function (disk) {
                  if (/\/dev\/.+/i.test(disk.filesystem)) {
                    var dev = disk.filesystem.split('/')[2]
                    agent.addMetrics({
                      type: 'os',
                      osdf: {
                        device: dev,
                        disk: {
                          available: disk.available * 1024,
                          used: disk.used * 1024,
                          used_percent: (disk.used / disk.available + disk.used) * 100
                        }
                      }
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
              linux.vmstatS(function (err, vmstats) {
                if (err) {
                  SpmAgent.Logger.error('error calling vmstat ' + err)
                  return
                }
                var checkMemTotal = vmstats.memory.used + vmstats.memory.free + vmstats.memory.buffer + vmstats.memory.cache
                if (checkMemTotal <= vmstats.memory.total) {
                  // should be equal on CentoOS 7.2
                  agent.addMetrics({
                    type: 'os',
                    osmem: {
                      used: vmstats.memory.used * 1024,
                      free: vmstats.memory.free * 1024,
                      cache: vmstats.memory.cache * 1024,
                      buffer: vmstats.memory.buffer * 1024,
                      swapd: vmstat.swapd * 1024,
                      si: vmstat.si,
                      so: vmstat.so
                    }
                  })
                } else {
                  agent.addMetrics({
                    type: 'os',
                    osmem: {
                      used: (vmstats.memory.used - (vmstats.memory.buffer + vmstats.memory.cache)) * 1024,
                      free: vmstats.memory.free * 1024,
                      cache: vmstats.memory.cache * 1024,
                      buffer: vmstats.memory.buffer * 1024,
                      swapd: vmstat.swapd * 1024,
                      si: vmstat.si,
                      so: vmstat.so
                    }
                  })
                }

                if (vmstats.disks) {
                  try {
                    vmstats.disks.forEach(function (disk) {
                      agent.addMetrics({
                        type: 'os',
                        osdio: {
                          device: disk.device,
                          read: (calcDiff(disk.device + 'sectors_read', disk.sectors_read) * 512),
                          write: (calcDiff(disk.device + 'sectors_written', disk.sectors_written) * 512)
                        }
                      })
                    })
                  } catch (diskInfoErr) {
                    console.log(diskInfoErr)
                  }
                }
              })
            })
          }
        }.bind(this), config.collectionInterval || 30000)
        if (timerId.unref) {
          timerId.unref()
        }
      }
    }
  }
  )
  return linuxAgent
}
