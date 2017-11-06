var DockerEvents = require('docker-events')
var SPM = require('spm-metrics-js')
var SpmAgent = require('spm-agent')
var os = require('os')

function DockerEventForwarder (docker) {
  var Docker = require('dockerode')
  try {
    this.docker = docker || new Docker()
    this.dockerEvents = new DockerEvents({docker: this.docker})
  } catch (dockerError) {
    SpmAgent.Logger.log('error', 'Error in sendEvent(): ' + dockerError)
  }
  this.spm = new SPM(SpmAgent.Config.tokens.spm, 0)
  this.spm.on('error', function (err) {
    try {
      SpmAgent.Logger.log('error', 'Error in DockerEventForwarder: ' + err)
    } catch (loggingError) {
      console.log(loggingError)
      console.log(err)
    }
  })
  /*
  this.spm.on('send event', function (result) {
    SpmAgent.Logger.log('debug', 'send event successful ' + JSON.stringify(result))
  })
  */
  var self = this
  this.sendEvent = function (type, msg) {
    // msg.type = type
    msg.creator = process.env.SPM_REPORTED_HOSTNAME || os.hostname()
    self.spm.sendEvent(type, msg, function (err, res) {
      if (err) {
        console.log('Error sending event to SPM ' + err)
      } else {
        if (res && res.statusCode > 299) {
          console.log('Error sending event to SPM ' + res.body)
        }
      }
    })
  }
  if (process.env.LOGSENE_TOKEN) {
    var Logsene = require('logsene-js')
    this.logsene = new Logsene(process.env.LOGSENE_TOKEN, 'dockerEvent')
    this.logsene.on('error', function ignoreLogseneJsErrors () {}) // logsene-js will retransmit, no output to avoid logging loop
  }
  this.forwardEvent = function (dockerEvent) {
    try {
      if (dockerEvent.Type) {
        if (!dockerEvent.status) {
          dockerEvent.status = dockerEvent.Type + ' ' + (dockerEvent.Action || '')
        }
        if (dockerEvent.Actor && dockerEvent.Actor.Attributes) {
          if (dockerEvent.Actor.Attributes.container) {
            dockerEvent.id = dockerEvent.Actor.Attributes.container
          }
          if (dockerEvent.Actor.Attributes.name && dockerEvent.Type !== 'network') {
            dockerEvent.containerName = dockerEvent.Actor.Attributes.name
          }
          if (dockerEvent.Actor.Attributes.image) {
            dockerEvent.imageName = dockerEvent.Actor.Attributes.image
          }
          dockerEvent.message = ''
          Object.keys(dockerEvent.Actor.Attributes).forEach(function (key, i) {
            if (i > 0) {
              dockerEvent.message += ', '
            }
            dockerEvent.message += key + ':' + dockerEvent.Actor.Attributes[key]
          })
        }
      }
      var msgStr = 'Docker Event: ' + dockerEvent.status + ' ' + (dockerEvent.containerName || dockerEvent.from || '') + ' ' + (dockerEvent.id || '') + ' ' + (dockerEvent.message || '')
      var msg = {
        dockerEventType: '' + dockerEvent.Type,
        dockerEventAction: '' + dockerEvent.Action,
        dockerEventFrom: '' + dockerEvent.from,
        dockerEventImageName: dockerEvent.imageName,
        message: msgStr,
        image_name: dockerEvent.from,
        container_id: dockerEvent.id,
        container_name: dockerEvent.containerName,
        dockerEventHost: process.env.SPM_REPORTED_HOSTNAME || os.hostname(),
        tags: ['docker', process.env.SPM_REPORTED_HOSTNAME || process.env.HOSTNAME || os.hostname(),
                dockerEvent.status]
      }
      if (dockerEvent.id && typeof dockerEvent.id === 'string') {
        msg.tags.push(dockerEvent.id.substring(0, 12))
      }
      if (self.logsene) {
        self.logsene.log('info', msgStr, msg)
      }
      var type = (dockerEvent.status || 'docker')
      type = type.replace(/[\W]/gi, '_')
      if (/exec_.*/.test(type)) {
        type = 'exec'
      }
      msg.title = 'docker ' + dockerEvent.status + ' ' + (dockerEvent.containerName || dockerEvent.imageName || '')
      self.sendEvent(type, msg)
    } catch (err) {
      console.error(err)
    }
  }
  setTimeout(function () {
    self.docker.version(function (err, data) {
      if (!err) {
        self.sendEvent('docker-info', { message: 'Docker: ' + data.Version + ' API: ' + data.ApiVersion + ' Kernel: ' + data.KernelVersion }, function (err, res) {
          if (err) {
            SpmAgent.Logger.log('error', 'Error in sendEvent(): ' + err)
          }
        })
      }
    })
  }, 500)
  this.dockerEvents.on('connect', function () {
    self.dockerEvents.on('_message', self.forwardEvent)
  })
  this.dockerEvents.on('disconnect', function () {
    self.dockerEvents.removeListener('_message', self.forwardEvent)
  })
  this.dockerEvents.on('error', function (err) {
    SpmAgent.Logger.log('error', 'Error in DockerEventsForwarder: ' + err)
  })
  this.dockerEvents.start()
  return this
}

module.exports = DockerEventForwarder
