var loghose = require('docker-loghose')
var Docker = require('dockerode')
var through = require('through2')
var Logsene = require('logsene-js')
var SpmAgent = require('spm-agent')
var Logagent = require('@sematext/logagent')
var fs = require('fs')
var loggers = {}
var getLogseneTokenByContainer = require('./dockerInspect')
var DockerEvents = require('docker-events')
var logsShipped = 0
var httpFailed = 0
var httpRetransmit = 0
var httpSend = 0

function getLogger (token) {
  var key = token
  // console.log(token)
  if (!loggers[key]) {
    var logger = new Logsene(token, 'docker')
    logger.on('log', function (res) {
      logsShipped += res.count
      httpSend += 1
    })
    logger.on('error', function (err) {
      httpFailed++
      spmLogError(err)
    })

    logger.on('rt', function (res) {
      httpRetransmit++
    })
    loggers[key] = logger
  }
  return loggers[key]
}
var dockerInspectCache = {}

function logToLogsene (level, message, data) {
  if (process.env.SPM_REPORTED_HOSTNAME) {
    data.host = process.env.SPM_REPORTED_HOSTNAME
  }
  data.logType = data._type || 'docker'
  data._type = 'docker'
  var dockerInspect = dockerInspectCache[data.container_id]
  if (dockerInspect) {
    var logger = getLogger(dockerInspect.LOGSENE_TOKEN || process.env.LOGSENE_TOKEN)
    if (dockerInspect.Config && dockerInspect.Config.Hostname) {
      data.container_hostname = dockerInspect.Config.Hostname
    }
    if (dockerInspect.NetworkSettings && dockerInspect.NetworkSettings.IPAddress) {
      data.ip = dockerInspect.NetworkSettings.IPAddress
    }
    if (dockerInspect.Config && dockerInspect.Config.Labels && dockerInspect.Config.Labels['com.docker.compose.project']) {
      data.compose_project = dockerInspect.Config.Labels['com.docker.compose.project']
      data.compose_container_number = dockerInspect.Config.Labels['com.docker.compose.container-number']
      data.compose_service = dockerInspect.Config.Labels['com.docker.compose.service']
      if (dockerInspect.Config.Labels['com.docker.swarm.id']) {
        data.swarm_id = dockerInspect.Config.Labels['com.docker.swarm.id']
      }
    }
    logger.log(level, message, data)
  } else {
    getLogseneTokenByContainer(data.container_id, function (err, info) {
      var token = process.env.LOGSENE_TOKEN
      if (!err && info) {
        dockerInspectCache[data.container_id] = info
        if (info.LOGSENE_TOKEN) {
          token = info.LOGSENE_TOKEN
        }
      }
      var logger = getLogger(token, 'docker')
      logger.log(level, message, data)
    })
  }
}

function createLogAgent () {
  var patternFile = '/etc/logagent/patterns.yml'
  if (fs.existsSync(patternFile)) {
    console.log(new Date().toISOString() + ' - INFO - Loading custom log parser definitions: ' + patternFile)
    return new Logagent(patternFile)
  } else {
    console.log(new Date().toISOString() + ' - INFO - Use -v /mypattern/patterns.yml:' + patternFile + ' for custom log parser definitions.')
    return new Logagent() // use default patterns
  }
}

function spmLogError (err) {
  SpmAgent.Logger.log('error', 'Error in logsene-js: ', err)
}
function logVersionInfo () {
  var versions = {
    nodeJS: process.versions.node,
    sematextDockerAgent: require('../package.json').version,
    logseneJS: require('logsene-js/package.json').version,
    dockerLoghose: require('docker-loghose/package.json').version,
    dockerStats: require('docker-stats/package.json').version,
    dockerEvents: require('docker-events/package.json').version
  }
  SpmAgent.Logger.info('module versions:' + JSON.stringify(versions, null, '\t'))
}
function DockerLogsene () {
  logVersionInfo()
  if (!process.env.REMOVE_ANSI_ESCAPE_SEQ) {
    process.env.REMOVE_ANSI_ESCAPE_SEQ = 'enabled'
  }
  this.logCount = 0
  this.imageNameRegEx = /sematext\/sematext-agent-docker/
  this.logagent = createLogAgent()
  this.logger = new Logsene(process.env.LOGSENE_TOKEN, 'docker')
  this.logger.on('error', spmLogError)

  var self = this
  if (process.env.DEBUG_SPM_LOGGING && process.env.DEBUG_SPM_LOGGING === 'enabled') {
    this.logger.on('log', function (req) {
      self.debugLog(req.url)
      self.debugLog(req.request)
    })
  }
  this.opts = {
    json: false,
    newline: true,
    docker: null,
    events: null,
    includeCurrentContainer: false,
    // the following options limit the containers being matched
    // so we can avoid catching logs for unwanted containers
    matchByName: process.env.MATCH_BY_NAME,
    matchByImage: process.env.MATCH_BY_IMAGE,
    skipByName: process.env.SKIP_BY_NAME,
    skipByImage: process.env.SKIP_BY_IMAGE
  }
  setTimeout(function () {
    self.initDockerEventHandlers()
  }, 50)
  setTimeout(function () {
    self.connect()
  }, 300)
  if (process.env.ENABLE_LOGSENE_STATS === 'true') {
    setInterval(function () {
      var logInfoString = 'SDA log stats: count=' + self.logCount + ' shipped=' + logsShipped + ' bulks_req_send=' + httpSend + ' bulk_req_failed=' + httpFailed + ' bulk_req_retransmit=' + httpRetransmit
      if (process.env.SPM_LOG_TO_CONSOLE) {
        console.log(logInfoString)
      }
      var logger = getLogger(process.env.LOGSENE_TOKEN, 'sda-logging-stats')
      logger.log('info', logInfoString,
        {type: 'sda-logging-stats',
          sdaStats_logCount: Number(self.logCount + 1),
          sdaStats_logsShipped: Number(logsShipped),
          sdaStats_httpSend: Number(httpSend),
          sdaStats_httpFailed: Number(httpFailed),
        sdaStats_httpRetransmit: Number(httpRetransmit)})
      self.resetStats()
    }, 60000)
  } else {
    setInterval(function () {
      self.resetStats()
    }, 60000)
  }
}

DockerLogsene.prototype.resetStats = function () {
  this.logCount = 0
  logsShipped = 0
  httpFailed = 0
  httpRetransmit = 0
  httpSend = 0
}

DockerLogsene.prototype.initDockerEventHandlers = function () {
  this.docker = new Docker()
  this.dockerEvents = new DockerEvents({docker: this.docker})
  this.dockerEvents.on('connect', function () {
    this.dockerEvents.on('die', function (dockerEvent) {
      delete dockerInspectCache[dockerEvent.id.substr(0, 12)]
    })
    this.dockerEvents.on('start', function (dockerEvent) {
      getLogseneTokenByContainer(dockerEvent.id.substr(0, 12), function (err, info) {
        if (!err && info) {
          dockerInspectCache[dockerEvent.id.substr(0, 12)] = info
        }
      })
    })
    this.dockerEvents.on('attach', function (dockerEvent) {
      var id = dockerEvent.id.substr(0, 12)
      if (dockerInspectCache[id]) {
        return
      }
      getLogseneTokenByContainer(id, function (err, info) {
        if (!err && info) {
          dockerInspectCache[id] = info
        }
      })
    })
  }.bind(this))
  this.dockerEvents.start()
}

DockerLogsene.prototype.debugLog = function (message) {
  if (process.env.DEBUG_SPM_LOGGING && process.env.DEBUG_SPM_LOGGING === 'enabled') {
    SpmAgent.Logger.log('debug', message)
  }
}
DockerLogsene.prototype.getLogObject = function (line, container, cbf) {
  if (process.env.DEBUG_SPM_LOGGING === 'enabled' && this.imageNameRegEx.test(container)) {
    cbf('Disabled logging for image sematext/sematext-agent-docker to avoid endless logging loop', null)
    return
  }
  // this.debugLog('Logs from Docker API (' + line.splitlength + ' lines) ' + container)
  this.debugLog('Logs from Docker API (content) for : ' + container + '\n' + line)
  var self = this
  if (line && line.length > 0) {
    this.logagent.parseLine(line, container, function (err, parsed) {
      self.debugLog('Log parser result: ' + JSON.stringify(parsed))
      return cbf(err, parsed)
    })
  }
}

DockerLogsene.prototype.connect = function () {
  var self = this
  var options = self.opts
  SpmAgent.Logger.log('debug', 'connect logStream to docker.sock')
  self.logStream = through.obj(function (chunk, enc, cb) {
    try {
      if (!chunk.line) {
        cb()
        return
      }
      setImmediate(function () {
        self.debugLog('Logs from Docker API:' + JSON.stringify(chunk))
        var lines = chunk.line.split('\n')
        lines.forEach(function (line) {
          self.logCount++
          self.logLine(line, chunk)
        })
        cb()
      })
    } catch (ex) {
      console.log(ex)
      cb()
    }
  })
  var lh = loghose(options)
  try {
    lh.on('error', this.reconnect)
    lh.pipe(self.logStream).on('error', this.reconnect)
  } catch (ex) {
    setTimeout(this.reconnect, 1000)
  }
}

DockerLogsene.prototype.parseKubernetesInfo = function (containerName, logObject) {
  // containers managed by Kubernetes have a prefix "k8s_", reference:
  // https://github.com/kubernetes/kubernetes/blob/f5d9c430e9168cf5c41197b8a4e457981cb031df/pkg/kubelet/dockertools/docker.go#L85
  if (!/k8s_/.test(containerName)) {
    return null
  }
  var fields = containerName.split('_')
  if (fields.length >= 4) {
    // example: k8s_sematext-agent.c56a873d_sematext-agent-qo2yf_default_e94b48c5-e63b-11e5-a8ec-0401b386ea01_8898bc93
    if (fields[0] !== 'k8s') {
      return null
    }
    logObject.kubernetes = {}
    logObject.kubernetes.container_name = fields[1]
    logObject.kubernetes.pod_name = fields[2]
    logObject.kubernetes.namespace = fields[3]
    logObject.kubernetes.uid = fields[4]
    return logObject
  } else {
    return null
  }
}

DockerLogsene.prototype.enrichAndLog = function (err, logObject) {
  if (err && !logObject) {
    return
  } else {
    if (!(logObject['@timestamp'] instanceof Date)) {
      logObject['@timestamp'] = new Date()
    }
    logObject.container_id = this.chunk.id
    logObject.image_name = this.chunk.image
    logObject.container_name = this.chunk.name
    var dockerInspect = dockerInspectCache[this.chunk.id]
    if (dockerInspect && dockerInspect.tags) {
      logObject.label = dockerInspect.tags
    }
    // logObject['logSource'] = this.sourceName
    if (!logObject['@timestamp']) {
      logObject['@timestamp'] = new Date(this.chunk.time)
    }
    this.parseKubernetesInfo(this.chunk.name, logObject)
    var messageString = logObject.message || logObject.msg || logObject.MESSAGE
    if (typeof message === 'object') {
      messageString = JSON.stringify(messageString)
    } else if (typeof message !== 'string') {
      messageString = String(messageString)
    }
    if ((Date.now() - logObject['@timestamp'].getTime()) < (90 * 24 * 60 * 60 * 1000)) {
      logToLogsene(
        String((logObject.level || logObject.lvl || logObject.severity || 'info')),
        messageString,
        logObject)
    }
  }
}
var ansiEscapeRegEx = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g
DockerLogsene.prototype.logLine = function (messageText, data, next) {
  var self = this
  var dockerInspect = dockerInspectCache[data.id]
  if (dockerInspect) {
    if (dockerInspect.LOGSENE_ENABLED === false) {
      return
    }
  }
  var logContext = {
    parseKubernetesInfo: self.parseKubernetesInfo,
    sourceName: data.image + '_' + data.name + '_' + data.id,
    chunk: data,
    line: (process.env.REMOVE_ANSI_ESCAPE_SEQ === 'enabled') ? messageText.replace(ansiEscapeRegEx, '') : messageText
  }
  setImmediate(function () {
    self.getLogObject(logContext.line, logContext.sourceName, self.enrichAndLog.bind(logContext))
  })
}

DockerLogsene.prototype.reconnect = function (err) {
  var self = this
  SpmAgent.Logger.log('error', 'Error in log stream: ' + err)
  try {
    self.logStream = null
    self.connect()
    SpmAgent.Logger.log('debug', 'reconnect to docker.sock ')
  } catch (ex) {
    SpmAgent.Logger.log('error', ex)
    setTimeout(function () {
      self.reconnect()
      SpmAgent.Logger.log('debug', 'reconnect to docker.sock ')
    }, 1000)
  }
}

module.exports = new DockerLogsene()
