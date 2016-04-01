/*
 * @copyright Copyright (c) Sematext Group, Inc. - All Rights Reserved
 *
 * @licence SPM for Docker is free-to-use, proprietary software.
 * THIS IS PROPRIETARY SOURCE CODE OF Sematext Group, Inc. (Sematext)
 * This source code may not be copied, reverse engineered, or altered for any purpose.
 * This source code is to be used exclusively by users and customers of Sematext.
 * Please see the full license (found in LICENSE in this distribution) for details on its license and the licenses of its dependencies.
 */
var stats = require('docker-stats')
var flatten = require('flat')
var through = require('through2')
var Aggregator = require('./aggregator.js')
var SpmAgent = require('spm-agent')
var config = SpmAgent.Config
var statsCallBackFuntion = null

var opts = {
  docker: null, //  here goes options for Dockerode
  events: null,  //  an instance of docker-allcontainers,
  statsinterval: 10,
  matchByName: process.env.SPM_MATCH_BY_NAME,
  matchByImage: process.env.SPM_MATCH_BY_IMAGE,
  skipByName: process.env.SPM_SKIP_BY_NAME,
  skipByImage: process.env.SPM_SKIP_BY_IMAGE
}
// holds aggregation object for each container
var cMetrics = {}
var counter = require('measured').createCollection()

function transformStatsApi1_21 (stats) {
  if (!stats.networks) {
    return stats
  }
  var result = {
      rx_bytes: 0,
      rx_packets: 0,
      rx_errors: 0,
      rx_dropped: 0,
      tx_bytes: 0,
      tx_packets: 0,
      tx_errors: 0,
      tx_dropped: 0
  }
  Object.keys(stats.networks).forEach(function aggNetworkMetrics (key) {
    Object.keys(result).forEach(function (metric) {
      result[metric] = result[metric] + getValueAsNum(stats.networks[key][metric])
    })
  })
  stats.network = result
  if (process.env.spmagent_logger__level === 'debug') {
    console.log('docker stats transformStatsApi1_21: ' + JSON.stringify(stats))
  }
  return stats
}

// handling different structures of docker stats
function transformStats (stats) {
  if (process.env.spmagent_logger__level === 'debug') {
    console.log('docker stats: ' + JSON.stringify(stats))
  }
  if (stats.network && stats.network.rx_bytes) {
    // API < 1.21
    return stats
  } else {
    return transformStatsApi1_21(stats)
  }
}

function processStats (chunk, enc, cb) {
  var stats = flatten(transformStats(chunk.stats))
  var metric = {}
  if (process.env.spmagent_logger__level === 'silly') {
    console.log(stats)
  }
  counter.meter('requestsPerSecond').mark()
  if (cMetrics[chunk.id] === undefined) {
    cMetrics[chunk.id] = new Aggregator()
  }
  metric.name = chunk.name
  metric.dockerId = chunk.id
  metric.image = chunk.image
  var agg = cMetrics[chunk.id]
  agg.info = metric
  metrics.forEach(function (key) {
    var value = stats[key] || 0
    if (/service_time_/i.test(key) || /wait_time_/i.test(key)) {
      // micro seconds to ms
      value = value / (1000 * 1000)
    }
    agg.update(stats['read'], key, getValueAsNum(value), useDivForAggregation[key] || false)
  })
  // setTimeout (cb, 10)
  cb()
}

function getDockerStats (dockerStatsCallback) {
  var dockerStatsStream = stats(opts)
  dockerStatsStream.pipe(through.obj(processStats))
  dockerStatsStream.on('closed', function () {
    console.log('docker stats stream closed')
    // process.exit()
  })
  dockerStatsStream.once('error', function (err) {
    console.log('docker stats stream error:' + err)
    // try to reconnect
    setTimeout(function () {
      getDockerStats(dockerStatsCallback)
    }, 15000)
    try {
      dockerStatsStream.close()
    } catch (ex) {
      console.log(ex)
    }
  })
}

function getStatsForContainer (container, aggStats) {
  var agg = cMetrics[container]
  if (!agg) {
    return null
  }
  var values = []
  aggStats.forEach(function (key) {
    var metricStats = agg.get(key)
    metricStats.id = container
    values.push(metricStats)
  })
  agg.reset()
  return values
}

var cpuMetrics = [
  // CPU
  // 'cpu_stats.cpu_usage.total_usage',
  // 'cpu_stats.cpu_usage.percpu_usage.0',
  // 'cpu_stats.cpu_usage.usage_in_kernelmode',
  // 'cpu_stats.cpu_usage.usage_in_usermode',
  'cpu_stats.cpu_usage.cpu_percent',
  // 'cpu_stats.system_cpu_usage',
  // 'cpu_stats.throttling_data.periods',
  // 'cpu_stats.throttling_data.throttled_periods',
  'cpu_stats.throttling_data.throttled_time'
]

var networkMetrics = [
  // NETWORK
  'network.rx_bytes',
  'network.rx_packets',
  'network.rx_errors',
  'network.rx_dropped',
  'network.tx_bytes',
  'network.tx_packets',
  'network.tx_errors',
  'network.tx_dropped'
]

var memoryMetrics = [
  // MEMORY
  'memory_stats.usage',
  'memory_stats.limit',
  'memory_stats.failcnt',
  // 'memory_stats.max_usage',
  // 'memory_stats.active_anon',
  // 'memory_stats.active_file',
  // 'memory_stats.cache',
  // 'memory_stats.hierarchical_memory_limit',
  // 'memory_stats.inactive_anon',
  // 'memory_stats.inactive_file',
  // 'memory_stats.mapped_file',
  'memory_stats.stats.pgfault',
  // 'memory_stats.pgmajfault',
  'memory_stats.stats.pgpgin',
  'memory_stats.stats.pgpgout'
  // 'memory_stats.ss',
  // 'memory_stats.rss_huge',
  // MEMORY FAIL COUNTER

  // MEMORY LIMIT

// MEMORY TOTAL
// 'memory_stats.total_active_anon',
// 'memory_stats.total_active_file',
// 'memory_stats.total_cache',
// 'memory_stats.total_inactive_anon',
// 'memory_total_inactive_file',
// 'memory_stats.total_mapped_file',
// 'memory_stats.total_pgfault',
// 'memory_stats.total_pgmajfault',
// 'memory_stats.total_pgpgin',
// 'memory_stats.total_pgpgout',
// 'memory_stats.total_rss',
// 'memory_stats.total_rss_huge',
// 'memory_stats.total_unevictable',
// 'memory_stats.stats.total_writeback',
// 'memory_stats.unevictable',
// 'memory_stats.writeback'
]

var ioMetrics = [
  // IO STATS
  // READ
  'blkio_stats.io_service_bytes_recursive.0.value',
  // READ time
  'blkio_stats.io_service_time_recursive.0.value',
  // READ wait time
  'blkio_stats.io_wait_time_recursive.0.value',
  // WRITE
  'blkio_stats.io_service_bytes_recursive.1.value',
  // Write time
  'blkio_stats.io_service_time_recursive.1.value',
  // Write wait time
  'blkio_stats.io_wait_time_recursive.1.value'
// 'blkio_io_service_bytes_recursive',
// 'blkio_io_serviced_recursive',
// 'blkio_io_queue_recursive',
// 'blkio_io_service_time_recursive',
// 'blkio_io_wait_time_recursive',
// 'blkio_io_merged_recursive',
// 'blkio_io_time_recursive',
// 'blkio_sectors_recursive'
]
var metrics = []
metrics = metrics.concat(cpuMetrics).concat(networkMetrics).concat(memoryMetrics).concat(ioMetrics)
var avgAggregation = {
  'cpu_stats.cpu_usage.cpu_percent': true,
  'cpu_stats.throttling_data.throttled_time': true,
  'memory_stats.usage': true,
  'memory_stats.limit': true,
  // READ time
  'blkio_stats.io_service_time_recursive.0.value': true,
  // READ wait time
  'blkio_stats.io_wait_time_recursive.0.value': true,
  // Write time
  'blkio_stats.io_service_time_recursive.1.value': true,
  // Write wait time
  'blkio_stats.io_wait_time_recursive.1.value': true
}
var useDivForAggregation = {
  'network.rx_bytes': true,
  'network.rx_packets': true,
  'network.rx_errors': true,
  'network.rx_dropped': true,
  'network.tx_bytes': true,
  'network.tx_packets': true,
  'network.tx_errors': true,
  'network.tx_dropped': true,
  'memory_stats.failcnt': true,
  'memory_stats.stats.pgfault': true,
  'memory_stats.stats.pgpgin': true,
  'memory_stats.stats.pgpgout': true,
  'blkio_stats.io_service_bytes_recursive.0.value': true,
  // READ time
  'blkio_stats.io_service_time_recursive.0.value': true,
  // READ wait time
  'blkio_stats.io_wait_time_recursive.0.value': true,
  // WRITE
  'blkio_stats.io_service_bytes_recursive.1.value': true,
  // Write time
  'blkio_stats.io_service_time_recursive.1.value': true,
  // Write wait time
  'blkio_stats.io_wait_time_recursive.1.value': true
}

function getValueAsNum (value) {
  var rv = 0
  var nuVal = Number(value)
  if (!isNaN(nuVal)) {
    rv = nuVal
  }
  return rv
}

function getStatsValue (metric) {
  if (avgAggregation[metric.name]) {
    return getValueAsNum(metric.mean)
  } else {
    return getValueAsNum(metric.sum)
  }
}
function dockerStatsCollector (statsCallback) {
  // start streaming docker stats
  getDockerStats()
  setInterval(function () {
    var containerCount = 0
    var cpuPercentTotal = 0
    for (var container in cMetrics) {
      containerCount++
      var values = getStatsForContainer(container, metrics)
      if (!values) {
        return statsCallback(null)
      }
      values = values.map(function (v) {
        var rv = getStatsValue(v)
        return rv
      })
      var stats = {dockerId: container, image: cMetrics[container].info.image, name: cMetrics[container].info.name, value: values}
      cpuPercentTotal += values[0]
      statsCallback(stats)
    }
    statsCallback({type: 'container', name: 'count', value: containerCount})
    statsCallback({type: 'container', name: 'totalcpu', value: cpuPercentTotal})
    cMetrics = {}
  }, config.collectionInterval)
}

module.exports = dockerStatsCollector
