#!/bin/sh
':' // ; export MAX_MEM=${MAX_MEM:-"--max-old-space-size=512"}; exec "$(command -v node || command -v nodejs)" "${NODE_OPTIONS:-$MAX_MEM}" "$0" "$@"

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
var request = require('request')
var fs = require('fs')
config.useLinuxAgent = true
// starts to capture docker logs
var dockerLogsene = null
var startDockerLogs = !process.env.DISABLE_DOCKER_LOGS
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
  fs.unlink('/etc/logagent/patterns.yml', () => {
    var cbCalled = false
    var patternFileWs = fs.createWriteStream('/etc/logagent/patterns.yml')
    patternFileWs.on('error', (ioerr) => {
      console.error('Error writing patterns to /etc/logagent/patterns.yml:' + process.env.PATTERNS_URL + ' ' + ioerr)
      if (!cbCalled) {
        cb(ioerr)
      }
    })
    patternFileWs.on('close', () => {
      console.log('Patterns stored in /etc/logagent/patterns.yml (' + process.env.PATTERNS_URL + ')')
      cb()
    })
    try {
      var req = request.get(process.env.PATTERNS_URL)
      req.on('error', (error) => {
        console.error('Patterns download failed: ' + process.env.PATTERNS_URL + ' ' + error)
      }).on('response', (response) => {
        console.log('Patterns downloaded ' + process.env.PATTERNS_URL + ' ')
      }).pipe(patternFileWs)
    } catch (ex) {
      console.error(ex.message)
      cbCalled = true
      cb(ex)
    }
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

if (process.env.LOGSENE_TOKEN !== undefined) {
  tokens++
  if (startDockerLogs) {
    downloadPatterns(() => {
      dockerLogsene = require('./dockerLogsene')
      if (process.env.JOURNALD_RECEIVER_PORT) {
        var journaldLogger = require('./tcpLogsene')
        // info('Listening for journald logs on port ' + process.env.JOURNALD_RECEIVER_PORT + ' use "journalctl -o json | ncat localhost ' + process.env.JOURNALD_RECEIVER_PORT + '" to ship them to Logsene')
      }
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
  // uncaughtErrors can happen in dockermodem/docekrode when Docker daemon restarts
  // therefore we need to tolerate those exceptions
  if (String(err).indexOf('Bad response from Docker engine') > -1) {
    // handled in docker logsene
    if (process.env.EXIT_ON_DOCKER_SOCKET_ERROR === 'true') {
      console.error('Lost connection to Docker socket, EXIT_ON_DOCKER_SOCKET_ERROR ')
      process.exit(3)
    }
    return
  }
  error('Please contact support@sematext.com to report the error:')
  error('UncaughtException:' + err + '\n  ' + err.stack)
  errorCounter++
  if (errorCounter > 50) {
    console.log('more than 50 uncaught errors -> exit.')
    process.exit(2)
  }
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
