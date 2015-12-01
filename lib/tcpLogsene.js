var TcpJsonReceiver = require('./tcpLogReceiver')
var tcpLdjServer = new TcpJsonReceiver(process.env.JOURNALD_RECEIVER_PORT || 9000)
var Logsene = require('logsene-js')
var logger = new Logsene(process.env.LOGSENE_TOKEN, 'journald')
var SpmAgent = require('spm-agent')
var spmLogger = SpmAgent.Logger
var ld = require('lodash')

function TcpLogsene () {
  tcpLdjServer.on('data', processEvents)
  if (SpmAgent.Config.traceLoggingStats) {
    traceLoggingStats()
  } else { 
    logger.on('error', function (err) {
      spmLogger.log('error', 'Error in logsene-js: ' + err, err)
    })
  }
}

function parseJournaldShort (line) {
  try {
    var fields = line.match(/^(\S+\s+\S+\s+\d+:\d+:\d+) (\S+) ([^:\[]+)\[?(\d*)\]?:\s+(.*)/i)
    if (fields && fields.length > 3) {
      var timestamp = new Date(fields[1])
      if (timestamp) {
        timestamp.setYear(new Date().getYear() + 1900) || new Date()
      } else {
        timestamp = new Date()
      }
      return {
        '@timestamp': timestamp.toISOString(),
        message: fields[5],
        host: fields[2],
        source: fields[3],
        tag: 'pid:' + fields[4]
      }
    }
    // check 'short-iso format'
    fields = line.match(/^(\d{4}\-\d+\-\d+T\d+:\d+:\d+).* (\S+) ([^:\[]+)\[?(\d*)\]?:\s+(.*)/i)
    if (fields && fields.length > 3) {
      return {
        '@timestamp': new Date(fields[1]).toISOString(),
        message: fields[5],
        host: fields[2],
        source: fields[3],
        tag: 'pid:' + fields[4]
      }
    }
  } catch (err) {
    return null
  }
}

var processEvents = function (logObj) {
  if (!logObj) {
    return
  }
  var data = ld.transform(logObj, function (result, val, key) {
    // remove empty fields, but keep boolean false objects
    if (val || val === false) {
      result[key.toLowerCase()] = val
    }
  })
  if (data.err && data.line) {
    // it's not JSON, try short format
    data = parseJournaldShort(data.line) || {message: data.line}
  } else {
    if (data && data['__realtime_timestamp']) {
      data['@timestamp'] = new Date(data['__realtime_timestamp'] / 1000).toISOString()
    }
  }
  var message = data.message || data.msg || (data.line || '').toString()
  // we might find sub fields in docker logs
  if ((data && data['syslog_identifier'] === 'dockerd') || data.source === 'dockerd') {
    var fields = (data['message'] || message).match(/time="(.+Z)" level=(.+) msg="(.+)"/)
    if (fields && fields.length > 3) {
      data['@timestamp'] = fields[1]
      data['level'] = fields[2]
      data['message'] = fields[3]
    }
  }
  spmLogger.debug(JSON.stringify(data))
  logger.log('info', message, data)
}

function traceLoggingStats () {
  var fail = 0
  var success = 0
  logger.on('error', function () {
    fail++
    spmLogger.debug('-!- failed bulk inserts: ' + fail)
  })
  logger.on('log', function (res) {
    try {
      var r = JSON.parse(res.response)
      if (r.errors === false && r.took > 0) {
        success++
      } else {
        console.log('200 but no body')
        fail++
      }
      if (r && r.status > 202) {
        fail++
        success--
        spmLogger.debug('docs in bulk: ' + res.count + ' FAILED')
      } else {
        spmLogger.debug('docs in bulk: ' + res.count + ' SUCCESS')
      }
    } catch (err) {
      fail++
    }
    spmLogger.debug('failed bulk inserts: ' + fail)
    spmLogger.debug('succesful bulk inserts: ' + success)
  })
}
module.export = TcpLogsene()
