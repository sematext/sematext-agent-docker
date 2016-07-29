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
  if (process.env.LOGSENE_TOKEN) {
    var Logsene = require('logsene-js')
    this.logsene = new Logsene(process.env.LOGSENE_TOKEN, 'dockerEvent')
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
          
          dockerEvent.containerName = dockerEvent.Actor.Attributes.name
          dockerEvent.message = ''
          Object.keys(dockerEvent.Actor.Attributes).forEach(function (key, i) {
            if (i > 0) {
              dockerEvent.message += ', '
            }
            dockerEvent.message += key + ':' + dockerEvent.Actor.Attributes[key]
          })
        }
      }
      var msgStr = 'Docker Event: ' + dockerEvent.status + ' ' + (dockerEvent.from || '') + ' ' + (dockerEvent.id || '') + ' ' + (dockerEvent.message || '')
      var msg = {
        _type: 'dockerEvent',
        dockerEventType: '' + dockerEvent.Type,
        dockerEventAction: '' + dockerEvent.Action,
        dockerEventFrom: '' + dockerEvent.from,
        message: msgStr,
        image_name: dockerEvent.from,
        container_id: dockerEvent.id,
        container_name: dockerEvent.containerName,
        dockerEventHost: '' + process.env.SPM_REPORTED_HOSTNAME,
        tags: ['docker', process.env.SPM_REPORTED_HOSTNAME || process.env.HOSTNAME || os.hostname() , dockerEvent.status, dockerEvent.id ]
      }
      if (self.logsene) {
        self.logsene.log('info', msgStr, msg)
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
