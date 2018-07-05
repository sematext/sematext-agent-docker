var loghose = require('docker-loghose')
var Docker = require('dockerode')
var through = require('through2')
var Logsene = require('logsene-js')
var SpmAgent = require('spm-agent')
var Logagent = require('@sematext/logagent')
var fs = require('fs')
var loggers = {}
var dockerInspectHelper = require('./dockerInspect')
var DockerEvents = require('docker-events')
var logsShipped = 0
var httpFailed = 0
var httpRetransmit = 0
var httpSend = 0
var logsWithoutToken = 0
var logsPassedToLogsene = 0
var getLogObjectCalls = 0
var enrichAndLogCounter = 0
var logToLogseneCount = 0
var dockerInspectCallback = 0
var warningRegex = /warning/i
var errorRegex = /[^|\S]error|exception/i
var ignoreLogsPattern = null

var maxAge = 90 * 24 * 60 * 60 * 1000
var autodetectSeverity = (process.env.ENABLE_AUTODETECT_SEVERITY === 'true')
var dotRegex = /\./g
var dockerInspectCache = {}
var debugSpmLogging = (process.env.DEBUG_SPM_LOGGING && process.env.DEBUG_SPM_LOGGING === 'enabled')
var K8S = /^k8s_/
var composeProjects = {}

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

function attachLabelsToLogs (dockerInspect, data) {
  if (dockerInspect.Config && dockerInspect.Config.Hostname) {
    data.container_hostname = dockerInspect.Config.Hostname
  }
  if (dockerInspect.NetworkSettings && dockerInspect.NetworkSettings.IPAddress) {
    data.ip = dockerInspect.NetworkSettings.IPAddress
  }
  if (dockerInspect.Config && dockerInspect.Config.Labels) {
    if (dockerInspect.Config.Labels['com.docker.compose.project']) {
      data.compose_project = dockerInspect.Config.Labels['com.docker.compose.project']
      data.compose_container_number = dockerInspect.Config.Labels['com.docker.compose.container-number']
      data.compose_service = dockerInspect.Config.Labels['com.docker.compose.service']
    }
    if (dockerInspect.Config.Labels['com.docker.swarm.node.id']) {
      data.swarm_node_id = dockerInspect.Config.Labels['com.docker.swarm.node.id']
      data.swarm_service_id = dockerInspect.Config.Labels['com.docker.swarm.service.id']
      data.swarm_service_name = dockerInspect.Config.Labels['com.docker.swarm.service.name']
      data.swarm_task_name = dockerInspect.Config.Labels['com.docker.swarm.task.name']
      data.swarm_task_name = dockerInspect.Config.Labels['com.docker.swarm.task.id']
      if (data.swarm_service_name) {
        var splitServiceName = data.swarm_service_name.split('.')
        if (splitServiceName && splitServiceName.length > 0) {
          data.swarm_container_number = splitServiceName[1]
        }
      }
    }
  }
}

function logToLogsene (level, message, data) {
  logToLogseneCount++
  if (process.env.SPM_REPORTED_HOSTNAME) {
    data.host = process.env.SPM_REPORTED_HOSTNAME
  }
  var token = process.env.LOGSENE_TOKEN
  data.logType = data._type || 'docker'
  data._type = 'docker'
  var dockerInspect = dockerInspectCache[data.container_id]
  var logger = null
  if (dockerInspect) {
    token = dockerInspect.LOGSENE_TOKEN || process.env.LOGSENE_TOKEN
    logger = getLogger(token)
    attachLabelsToLogs(dockerInspect, data)
    if (logger) {
      logger.log(level, message, data)
      logsPassedToLogsene++
    } else {
      if (process.env.DEBUG_LOGS) {
        console.error('No logger object for token: ' + token)
        logsWithoutToken++
      }
    }
  } else {
    dockerInspectCallback++
    dockerInspectHelper.getLogseneTokenForContainer(data.container_id, function (err, info) {
      dockerInspectCallback++
      if (!err && info) {
        dockerInspectCache[data.container_id] = info
        if (info.LOGSENE_TOKEN) {
          token = info.LOGSENE_TOKEN
        }
        attachLabelsToLogs(info, data)
      }
      logger = getLogger(token, 'docker')
      if (logger) {
        logger.log(level, message, data)
        logsPassedToLogsene++
      } else if (process.env.DEBUG_LOGS) {
        console.error('No logger object for token: ' + token)
        logsWithoutToken++
      }
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
  if (process.env.SEVERITY_ERROR_PATTERN) {
    errorRegex = new RegExp(process.env.SEVERITY_ERROR_PATTERN)
  }
  if (process.env.SEVERITY_WARNING_PATTERN) {
    warningRegex = new RegExp(process.env.SEVERITY_WARNING_PATTERN)
  }
  if (process.env.IGNORE_LOGS_PATTERN) {
    ignoreLogsPattern = new RegExp(process.env.IGNORE_LOGS_PATTERN)
  }

  this.logCount = 0
  this.imageNameRegEx = /sematext\/sematext-agent-docker/
  this.logagent = createLogAgent()
  this.logger = new Logsene(process.env.LOGSENE_TOKEN, 'docker')
  this.logger.on('error', spmLogError)

  var self = this
  if (debugSpmLogging) {
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
    skipByImage: process.env.SKIP_BY_IMAGE,
    attachFilter: function (id, info) {
      var dockerInfo = dockerInspectHelper.getLogseneEnabled(info)
      if (dockerInfo) {
        var cid = id.substr(0, 12)
        dockerInspectCallback++
        dockerInspectCache[cid] = dockerInfo
        // tagging SPM hosts with running compose_projects
        // we do this here to execute the code only when new containers are discovered
        if (info.Config && info.Config.Labels) {
          if (info.Config.Labels['com.docker.compose.project']) {
            var composeProject = info.Config.Labels['com.docker.compose.project']
            if (process.env.SPM_MONITOR_TAGS) {
              if (!composeProjects[composeProject]) {
                composeProjects[composeProject] = true
                process.env.SPM_MONITOR_TAGS = process.env.SPM_MONITOR_TAGS + ',' + composeProject
              }
            } else if (process.env.SPM_TOKEN && !composeProjects[composeProject]) {
              composeProjects[composeProject] = true
              process.env.SPM_MONITOR_TAGS = composeProject
            }
          }
        }
      }
      return (dockerInfo.LOGSENE_ENABLED === true)
    }
  }
  setInterval(function () {
    k8sMetadata = {}
  }, 120000)
  setTimeout(function () {
    self.initDockerEventHandlers()
  }, 50)

  if (process.env.ENABLE_LOGSENE_STATS === 'true') {
    setInterval(function () {
      var logInfoString = 'SDA log stats: count=' + self.logCount + ' shipped=' + logsShipped + ' bulks_req_send=' + httpSend + ' bulk_req_failed=' + httpFailed + ' bulk_req_retransmit=' + httpRetransmit + ' logsPassedToLogsene=' + logsPassedToLogsene + ' logsWithoutToken=' + logsWithoutToken
      if (process.env.SPM_LOG_TO_CONSOLE) {
        console.log(logInfoString)
      }
      var logger = getLogger(process.env.LOGSENE_TOKEN, 'sda-logging-stats')
      var sdaStats = {
        type: 'sda-logging-stats',
        sdaStats_logCount: Number(self.logCount + 1),
        sdaStats_logsShipped: Number(logsShipped),
        sdaStats_httpSend: Number(httpSend),
        sdaStats_httpFailed: Number(httpFailed),
        sdaStats_httpRetransmit: Number(httpRetransmit),
        sdaStats_dockerInspectCallbacks: dockerInspectCallback,
        sdaStats_logsWithoutToken: Number(logsWithoutToken),
        sdaStats_getLogObjectCalls: Number(getLogObjectCalls),
        sdaStats_enrichAndLog: enrichAndLogCounter,
        sdaStats_logToLogsene: logToLogseneCount,
        sdaStats_logsPassedToLogseneApi: Number(logsPassedToLogsene)
      }
      logger.log('info', logInfoString, sdaStats)
      if (process.env.DEBUG_LOGS) {
        console.log(JSON.stringify(sdaStats, null, '  '))
        if (logToLogseneCount !== logsPassedToLogsene && process.env.DEBUG_LOGSnode) {
          console.error('Warning logToLogsene != logsPassedToLogsene')
        }
      }
      self.resetStats()
    }, 60000)
  } else {
    setInterval(function () {
      self.resetStats()
    }, 60000)
  }
  self.connect()
}

DockerLogsene.prototype.resetStats = function () {
  this.logCount = 0
  logsShipped = 0
  httpFailed = 0
  httpRetransmit = 0
  httpSend = 0
  logsPassedToLogsene = 0
  logsWithoutToken = 0
  getLogObjectCalls = 0
  dockerInspectCallback = 0
  enrichAndLogCounter = 0
  logToLogseneCount = 0
}

DockerLogsene.prototype.initDockerEventHandlers = function () {
  this.docker = new Docker()
  this.dockerEvents = new DockerEvents({docker: this.docker})
  this.dockerEvents.on('connect', function () {
    this.dockerEvents.on('die', function (dockerEvent) {
      delete dockerInspectCache[dockerEvent.id.substr(0, 12)]
    })
    this.dockerEvents.on('start', function (dockerEvent) {
      dockerInspectHelper.getLogseneTokenForContainer(dockerEvent.id.substr(0, 12), function (err, info) {
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
      dockerInspectHelper.getLogseneTokenForContainer(id, function (err, info) {
        if (!err && info) {
          dockerInspectCache[id] = info
        }
      })
    })
  }.bind(this))
  this.dockerEvents.start()
}

DockerLogsene.prototype.debugLog = function (message, data) {
  if (debugSpmLogging) {
    if (!data) {
      SpmAgent.Logger.log('info', message)
    } else {
      try {
        SpmAgent.Logger.log('info', message + ' ' + JSON.stringify(data))
      } catch (err) {
        SpmAgent.Logger.log('info', message)
      }
    }
  }
}
DockerLogsene.prototype.getLogObject = function (line, container, cbf) {
  if (debugSpmLogging && this.imageNameRegEx.test(container)) {
    cbf('Disabled logging for image sematext/sematext-agent-docker to avoid endless logging loop', null)
    if (process.env.DEBUG_LOGS) {
      console.log('Disabled logging for image sematext/sematext-agent-docker to avoid endless logging loop')
    }
    logCount--
    return
  }
  // this.debugLog('Logs from Docker API (content) for : ' + container + '\n' + line)
  if (line && line.length > 0) {
    this.logagent.parseLine(line, container, cbf)
  }
}

DockerLogsene.prototype.connect = function () {
  var self = this
  var options = self.opts
  SpmAgent.Logger.log('debug', 'connect logStream to docker.sock')
  self.logStream = through.obj(function (chunk, enc, cb) {
    if (!chunk.line) {
      cb()
      return
    }
    setImmediate(function () {
      // self.debugLog('Logs from Docker API:', chunk)
      if (ignoreLogsPattern && ignoreLogsPattern.test(chunk.line)) {
        return cb()
      }
      self.logCount++
      self.logLine(chunk.line, chunk)
      cb()
    })
  })
  this.lh = loghose(options)
  try {
    this.lh.on('error', this.reconnect.bind(this))
    this.lh.pipe(self.logStream).on('error', this.reconnect.bind(this))
  } catch (ex) {
    console.error('reconnect to docker socket in 1 sec ...')
    setTimeout(this.reconnect, 1000)
  }
}

DockerLogsene.prototype.parseKubernetesInfo = function (containerName, logObject) {
  // containers managed by Kubernetes have a prefix "k8s_", reference:
  // https://github.com/kubernetes/kubernetes/blob/f5d9c430e9168cf5c41197b8a4e457981cb031df/pkg/kubelet/dockertools/docker.go#L85
  if (!K8S.test(containerName)) {
    return null
  }
  // cache for meta data
  if (k8sMetadata[containerName]) {
    logObject.kubernetes = k8sMetadata[containerName]
    return logObject
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
    k8sMetadata[containerName] = logObject.kubernetes
    return logObject
  } else {
    return null
  }
}
function getTaggingLabels (dockerInspect) {
  if (dockerInspect && dockerInspect.tags) {
    // Elasticsearch 5 does not support dots in field names (for String fields)
    // Dots would be interpreted as object properties, which could cause errors during indexing
    var tags = {}
    var keys = Object.keys(dockerInspect.tags)
    if (keys.length === 0) {
      return null
    }
    for (var i = 0; i < keys.length; i++) {
      // replace dots with underscore and create new tag list
      var elasticsearchCompliantFieldName = keys[i].replace(dotRegex, '_')
      tags[elasticsearchCompliantFieldName] = dockerInspect.tags[keys[i]]
    }
    return tags
  } else {
    return null
  }
}
DockerLogsene.prototype.enrichAndLog = function (err, logObject) {
  if (logObject) {
    enrichAndLogCounter++
  }
  if (err && !logObject) {
    if (process.env.DEBUG_LOGS) {
      console.error(err, logObject)
    }
  } else {
    var timestamp = logObject['@timestamp']
    if (!(timestamp instanceof Date) || !timestamp) {
      timestamp = new Date(this.chunk.time)
      logObject['@timestamp'] = timestamp
    }
    logObject.container_id = this.chunk.id
    logObject.image_name = this.chunk.image
    logObject.container_name = this.chunk.name
    var dockerInspect = dockerInspectCache[this.chunk.id]
    if (dockerInspect && dockerInspect.tags) {
      var tags = getTaggingLabels(dockerInspect)
      if (tags) {
        logObject.label = tags
      }
    }
    this.parseKubernetesInfo(this.chunk.name, logObject)
    // make sure that top level message field is a String
    var messageString = logObject.message || logObject.msg || logObject.MESSAGE
    if (typeof messageString === 'object') {
      messageString = JSON.stringify(messageString)
    } else if (typeof messageString !== 'string') {
      messageString = String(messageString)
    }
    if (logObject.message) {
      logObject.message = messageString
    }
    if ((Date.now() - timestamp.getTime()) < (maxAge)) {
      var severity = (logObject.level || logObject.lvl || logObject.severity)
      if (autodetectSeverity && logObject.message && !severity) {
        // detect severity
        var testString = String(logObject.message).substring(0, 80)
        if (errorRegex.test(testString)) {
          severity = 'error'
        }
        if (warningRegex.test(testString)) {
          severity = 'warning'
        }
        testString = null
        logObject.severity = severity || 'info'
      }
      logToLogsene(
        severity,
        messageString,
        logObject)
    } else {
      if (process.env.DEBUG_LOGS) {
        console.error('Log timestamp too old: ' + timestamp, logObject)
      }
    }
  }
}
var ansiEscapeRegEx = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g
var k8sMetadata = {}
DockerLogsene.prototype.logLine = function (messageText, data, next) {
  var self = this
  var dockerInspect = dockerInspectCache[data.id]
  if (dockerInspect) {
    if (dockerInspect.LOGSENE_ENABLED === false) {
      // This should not happen anymore, because we use lh.opt.attachFilter
      // close stream from docker API for this container
      self.lh.detachContainer(data.id)
      return
    }
  }
  var logContext = {
    parseKubernetesInfo: self.parseKubernetesInfo,
    sourceName: data.image + '_' + data.name + '_' + data.id,
    chunk: data,
    line: (process.env.REMOVE_ANSI_ESCAPE_SEQ === 'enabled') ? messageText.replace(ansiEscapeRegEx, '') : messageText
  }
  getLogObjectCalls++
  self.getLogObject(logContext.line, logContext.sourceName, self.enrichAndLog.bind(logContext))
}

DockerLogsene.prototype.reconnect = function (err) {
  var self = this
  SpmAgent.Logger.log('error', 'Error in log stream: ' + err)
  try {
    SpmAgent.Logger.log('debug', 'reconnect to docker.sock ')
    self.logStream = null
    self.connect.bind(self)()
  } catch (ex) {
    SpmAgent.Logger.log('error', ex)
    SpmAgent.Logger.log('debug', 'reconnect to docker.sock failed')
  }
}

module.exports = new DockerLogsene()
