#!/usr/bin/env node
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
process.env.spmagent_logger__console = 'true'
var config = SpmAgent.Config
config.useLinuxAgent = true
config.collectionInterval = 10000
// starts to capture docker logs
var dockerLogsene = null
var startDockerLogs = process.env.DISABLE_DOCKER_LOGS ? false : true

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
    './osAgent'
  ]
  agentsToLoad.forEach(function (a) {
    try {
      var Monitor = require(a)
      njsAgent.createAgent(new Monitor())
    } catch (err) {
      console.log(err)
      SpmAgent.Logger.error('Error loading agent ' + a + ' ' + err)
    }
  })
  return njsAgent
}
var tokens = 0
if (process.env.SPM_TOKEN || process.argv[2] && process.argv[2].length > 30) {
  tokens++
  DockerMonitor()
} else {
  console.log('Missing SPM_TOKEN')
}
if (process.env.LOGSENE_TOKEN) {
  tokens++
  if (startDockerLogs) {
    dockerLogsene = require('./dockerLogsene')
  }
  process.env.JOURNALD_RECEIVER_PORT = process.env.JOURNALD_RECEIVER_PORT || 9000
  var journaldLogger = require('./tcpLogsene')
  console.log('Listening for "journalctl -o json | ncat localhost PORT" on exposed port ' + process.env.JOURNALD_RECEIVER_PORT)

} else {
  console.log('Missing LOGSENE_TOKEN')
}
if (tokens === 0) {
  console.log('Please specify the required environment variables: SPM_TOKEN and LOGSENE_TOKEN')
  process.exit(-1)
}

process.on('uncaughtException', function (err) {
  console.error((new Date).toUTCString() + ' uncaughtException:', err.message)
  console.error(err.stack)
})
