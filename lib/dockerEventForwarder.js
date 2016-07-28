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
    SpmAgent.Logger.log('error', 'Error in sendEvent(): ' + err)
  }

  this.spm = new SPM(SpmAgent.Config.tokens.spm, 0)
  this.spm.on('error', function (err) {
    try {
      SpmAgent.Logger.log('error', 'Error in DockerEventForwarder: ' + err)
    } catch (err2) {
      console.log(err2)
      console.log(err)
    }
  })
  var self = this
  this.sendEvent = function (type, msg) {
    msg.creator = process.env.HOSTNAME || os.hostname()
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
  this.forwardEvent = function (dockerEvent) {
    try {
      if (dockerEvent.Type) {
        if (!dockerEvent.status) {
          dockerEvent.status = dockerEvent.Type + ' ' + (dockerEvent.Action || '')
        }
        if (dockerEvent.Actor && dockerEvent.Actor.Attributes) {
          dockerEvent.id = dockerEvent.Actor.Attributes.container
          dockerEvent.message = ''
          Object.keys(dockerEvent.Actor.Attributes).forEach(function (key, i) {
            if (i > 0) {
              dockerEvent.message += ', '
            }
            dockerEvent.message += key + ':' + dockerEvent.Actor.Attributes[key]
          })
        }
      }
      var msgStr = dockerEvent.status + ' ' + (dockerEvent.from || '') + ' ' + (dockerEvent.id || '') + ' ' + (dockerEvent.message || '')
      if (process.env.SPM_LOG_LEVEL==='debug') {
        console.log('Docker Event: ' + msgStr) 
      }
      var msg = {
        name: dockerEvent.from,
        message: msgStr,
        tags: ['docker', process.env.HOSTNAME || os.hostname(), dockerEvent.status, dockerEvent.id ]
      }
      var type = (dockerEvent.status || 'docker')
      type = type.replace(/[\W]/gi, '_')
      if (/exec_.*/.test(type)) {
        type = 'exec'
      }
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
