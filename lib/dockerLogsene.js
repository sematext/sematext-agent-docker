var loghose = require('docker-loghose')
var Docker = require('dockerode')
var through = require('through2')
var Logsene = require('logsene-js')
var SpmAgent = require('spm-agent')
var Logagent = require('logagent-js')
var fs = require('fs')
var loggers = {}
var getLogseneTokenByContainer = require('./dockerInspect')
var DockerEvents = require('docker-events')

function getLogger (token) {
  var key = token
  // console.log(token)
  if (!loggers[key]) {
    var logger = new Logsene(token, 'docker')
    logger.on('error', function (err) {
      console.error('Error in Logsene request:' + err.message)
    })
    loggers[key] = logger
  }
  return loggers[key]
}
var dockerInspectCache = {}

function logToLogsene (level, message, data) {
  if (process.env.SPM_REPORTED_HOSTNAME) {
    data.docker_host = process.env.SPM_REPORTED_HOSTNAME
  }
  var dockerInspect = dockerInspectCache[data.container_id]
  if (dockerInspect) {
    var logger = getLogger(dockerInspect.LOGSENE_TOKEN || process.env.LOGSENE_TOKEN)
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
      dockerInspectCache[data.container_id] = info
      var logger = getLogger(info.LOGSENE_TOKEN || process.env.LOGSENE_TOKEN, 'docker')
      logger.log(level, message, data)
    })
  }
}

function createLogAgent () {
  var patternFile = '/etc/logagent/patterns.yml'
  if (fs.existsSync(patternFile)) {
    console.log('Loading custom log parser definitions: ' + patternFile)
    return new Logagent(patternFile)
  } else {
    console.log('Use -v /mypattern/patterns.yml:' + patternFile + ' for custom log parser definitions.')
    return new Logagent() // use default patterns
  }
}

function DockerLogsene () {
  if (!process.env.REMOVE_ANSI_ESCAPE_SEQ) {
    process.env.REMOVE_ANSI_ESCAPE_SEQ = 'enabled'
  }
  this.imageNameRegEx = /sematext\/sematext-agent-docker/
  this.logagent = createLogAgent()
  this.logger = new Logsene(process.env.LOGSENE_TOKEN, 'docker')
  this.logger.on('error', function (err) {
    SpmAgent.Logger.log('error', 'Error in logsene-js: ' + err, err)
  })

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
        dockerInspectCache[dockerEvent.id.substr(0, 12)] = info
      })
    })
    this.dockerEvents.on('attach', function (dockerEvent) {
      var id = dockerEvent.id.substr(0, 12)
      if (dockerInspectCache[id])
        return
      getLogseneTokenByContainer(id, function (err, info) {
        dockerInspectCache[id] = info
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
      self.debugLog('Logs from Docker API:' + JSON.stringify(chunk))
      var lines = chunk.line.split('\n')
      lines.forEach(function (line) {
        self.logLine(line, chunk)
      })
      cb()
    } catch (ex) {
      console.log(ex)
      cb()
    }
  })
  // self.logStream.once('error', this.reconnect)
  var lh = loghose(options)
  lh.pipe(self.logStream)
  lh.on('error', this.reconnect)
}

DockerLogsene.prototype.parseKubernetesInfo = function (containerName, logObject) {
  if (!process.env.KUBERNETES) {
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
DockerLogsene.prototype.logLine = function (logline, data, next) {
  var self = this
  var lineParser = {
    sourceName: data.image + '_' + data.name + '_' + data.id,
    chunk: data,
    line: (process.env.REMOVE_ANSI_ESCAPE_SEQ === 'enabled') ? logline.replace(
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      '') : logline,
    parse: function () {
      var chunk = this.chunk
      var lp = this
      self.getLogObject(this.line,
        this.sourceName,
        function (err, logObject) {
          if (err && !logObject) {
            return
          }
          if (logObject) {
            logObject.container_id = chunk.id
            logObject.image_name = chunk.image
            logObject.container_name = chunk.name
            if (!logObject['_type']) {
              logObject['_type'] = chunk.image.replace(/[\W]/gi, '_')
            }
            logObject['@source'] = lp.sourceName
            if (!logObject['@timestamp']) {
              logObject['@timestamp'] = new Date(chunk.time)
            }
            self.parseKubernetesInfo(chunk.name, logObject)
            if ((Date.now() - logObject['@timestamp'].getTime()) < (90 * 24 * 60 * 60 * 1000)) {
              logToLogsene(
                String((logObject.level || logObject.lvl || logObject.severity || 'info')),
                logObject.message || logObject.msg || logObject.MESSAGE, logObject,
                function (err, msg) {
                  if (err) {
                    self.debugLog('Error sending log:' + err)
                  }
                  if (msg && process.env.DEBUG_SPM_LOGGING) {
                    self.debugLog('Stored Log: ' + JSON.stringify(msg))
                  }
                })
            }
          }
        })
    }
  }
  lineParser.parse()
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
