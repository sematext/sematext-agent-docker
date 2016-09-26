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
var which = require('which')
var vmstatCommand = which.sync('vmstat')
var exec = require('child_process').exec
var diskfree = require('node-df')
var procfs = require('procfs-stats')

function vmstatS (callback) {
  exec(vmstatCommand + ' -s', function (err, stout) { // 3rd parameter is sterr, not used
    if (err) {
      callback(err)
      return
    }
    try {
      var lines = stout.split('\n')
      lines = lines.map(function (line) { return line.trim() })
      if (lines.length >= 21) {
        var swapMapping = {
          swapUsed: 8,
          swapIn: 20,
          swapOut: 21
        }
        var memoryMapping = {
          total: 0,
          used: 1,
          active: 2,
          inactive: 3,
          free: 4,
          buffer: 5,
          cache: 6
        }
        /* var cpuMapping = {
          user: 10,
          nice: 11,
          sys: 12,
          idle: 13,
          wait: 14,
          irq: 15,
          softirq: 16,
          stolen: 17
        } */
        var mapValues = function (mapping) {
          var result = {}
          for (var property in mapping) {
            result[property] = parseInt(lines[mapping[property]].replace(/\s+/, ' ').split(' ')[0], 10)
          }
          return result
        }
        var rv = {
          swap: mapValues(swapMapping),
          // cpu: mapValues(cpuMapping),
          memory: mapValues(memoryMapping)
        }
        setTimeout(function () {
          diskIOStats(function (disks) {
            // console.log(disks)
            rv.disks = disks
            callback(null, rv)
          })
        }, 1000)
      }
    } catch (error) {
      callback(error)
    }
  })
}

function vmstat (callback) {
  exec(vmstatCommand, function (err, stout, sterr) {
    // console.log (values)
    function mapValues (mapping) {
      var result = {}
      for (var property in mapping) {
        result[property] = parseInt(values[mapping[property]], 10)
      }
      return result
    }
    try {
      if (err) {
        callback(err)
        return
      }
      var lines = stout.split('\n')
      // console.log(lines)
      // var headers = lines[1].trim().replace(/\s+/g, ' ').split(' ')
      var values = lines[2].trim().replace(/\s+/g, ' ').split(' ')
      var mapping = {
        swapd: 2,
        free: 3,
        buff: 4,
        cache: 5,
        si: 6,
        so: 7,
        bi: 8,
        bo: 9
      }
      var rv = mapValues(mapping)
      callback(null, rv)
    } catch (error) {
      callback(error, null)
    }
  })
}

function df (callback) {
  diskfree(function dfCallback (error, response) {
    if (error) {
      return callback(error)
    }
    return callback(null, response)
  })
}

function cpuStats (cb) {
  procfs.cpu(function (flag, data) {
    if (!flag && data && data.cpu) {
      cb(data)
    } else {
      return null
    }
  })
}

function diskIOStats (cb) {
  procfs.disk(function (flag, data) {
    if (data) {
      var devices = data.filter(function (disk) {
        return (!/ram|loop/i.test(disk.device))
      })
      cb(devices)
    } else {
      cb([])
    }
  })
}

function networkStats (cb) {
  procfs.net(function (err, data) {
    if (data && !err) {
      cb(data)
    } else {
      cb([])
    }
  })
}

module.exports.vmstatS = vmstatS
module.exports.vmstat = vmstat
module.exports.df = df
module.exports.networkStats = networkStats
module.exports.cpuStats = cpuStats
