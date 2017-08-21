#!/bin/sh
':' // ; export MAX_MEM="--max-old-space-size=512"; exec "$(command -v node || command -v nodejs)" "${NODE_OPTIONS:-$MAX_MEM}" "$0" "$@"

/*
 * @copyright Copyright (c) Sematext Group, Inc. - All Rights Reserved
 *
 * @licence SPM for Docker is free-to-use, proprietary software.
 * THIS IS PROPRIETARY SOURCE CODE OF Sematext Group, Inc. (Sematext)
 * This source code may not be copied, reverse engineered, or altered for any purpose.
 * This source code is to be used exclusively by users and customers of Sematext.
 * Please see the full license (found in LICENSE in this distribution) for details on its license and the licenses of its dependencies.
 */
var SpmAgent = require('spm-agent')
var config = SpmAgent.Config
config.useLinuxAgent = true
// starts to capture docker logs
var dockerLogsene = null
var startDockerLogs = process.env.DISABLE_DOCKER_LOGS ? false : true
// check system date to avoid producing logs in the past.
// we have seen systems reporting 1970
if (new Date().getYear() < 116) {
  console.log('Invalid system date ' + new Date())
  process.exit(100)
}

function downloadPatterns (cb) {
  if (!process.env.PATTERNS_URL) {
    return cb()
  }
  const fs = require('fs')
  const download = require('download')
  fs.unlink('/etc/logagent/patterns.yml', () => {
    download(process.env.PATTERNS_URL,
      '/etc/logagent',
      {filename: 'patterns.yml'}
    ).then((a, b, c) => {
      console.log('Downloaded patterns ' + process.env.PATTERNS_URL + ' ')
      return cb()
    }).catch((error) => {
      console.error('Error downloading patterns: ' + process.env.PATTERNS_URL + ' ' + error)
      return cb(error)
    })
  })
}

function DockerMonitor () {
  if (process.env.SPM_TOKEN && !SpmAgent.Config.tokens.spm) {
    SpmAgent.Config.tokens.spm = process.env.SPM_TOKEN
  }
  if (process.argv[2] && process.argv[2].length > 30) {
    SpmAgent.Config.tokens.spm = process.argv[2]
  }
  var njsAgent = new SpmAgent()
  njsAgent.on('metrics', console.log)
  var agentsToLoad = [
    './dockerAgent',
    'spm-agent-os'
  ]
  agentsToLoad.forEach(function (a) {
    try {
      var Monitor = require(a)
      njsAgent.createAgent(new Monitor())
    } catch (err) {
      error('Error loading agent ' + a + ' ' + err.stack)
      error(err)
      SpmAgent.Logger.error('ERROR - Error loading agent ' + a + ' ' + err)
    }
  })
  return njsAgent
}
var tokens = 0
if (process.env.SPM_TOKEN || process.argv[2] && process.argv[2].length > 30) {
  tokens++
  DockerMonitor()
} else {
  info('No metrics will be collected: missing parameter -e SPM_TOKEN=YOUR_SPM_TOKEN')
}
if (process.env.LOGSENE_TOKEN) {
  tokens++
  if (startDockerLogs) {
    downloadPatterns(() => {
      dockerLogsene = require('./dockerLogsene')
      process.env.JOURNALD_RECEIVER_PORT = process.env.JOURNALD_RECEIVER_PORT || 9000
      var journaldLogger = require('./tcpLogsene')
      info('Listening for journald logs on port ' + process.env.JOURNALD_RECEIVER_PORT + ' use "journalctl -o json | ncat localhost ' + process.env.JOURNALD_RECEIVER_PORT + '" to ship them to Logsene')
    })
  }
} else {
  info('No logs will be collected: missing -e LOGSENE_TOKEN=YOUR_LOGSENE_TOKEN')
}
if (tokens === 0) {
  error('Please specify the required environment variables: SPM_TOKEN and LOGSENE_TOKEN')
  info('Create SPM App: https://apps.sematext.com/spm-reports/registerApplication.do')
  info('Create Logsene App: https://apps.sematext.com/logsene-reports/registerApplication.do')
  process.exit(1)
}
var errorCounter = 0
process.on('uncaughtException', function (err) {
  error('Please contact support@sematext.com to report the error:')
  error('UncaughtException:' + err + '\n  ' + err.stack)
  errorCounter++
  if (errorCounter > 1) {
    // console.log('more than 50 uncaught errors -> exit.')
    process.exit(2)
  }
//
})

function error (m) {
  log('ERROR', m)
}
function info (m) {
  log('INFO', m)
}
function log (level, message) {
  var msg = (new Date()).toISOString() + ' - ' + level + ' - ' + message
  if (level === 'ERROR') {
    console.error(msg)
  } else {
    console.log(msg)
  }
}
