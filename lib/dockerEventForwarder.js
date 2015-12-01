var DockerEvents = require('docker-events')
var SPM = require('spm-metrics-js')
var SpmAgent = require('spm-agent')
var os = require('os')

function DockerEventForwarder (docker) {
  var Docker = require('dockerode')
  this.docker = docker || new Docker({socketPath: '/var/run/docker.sock'})
  this.dockerEvents = new DockerEvents({docker: this.docker})

  this.spm = new SPM(SpmAgent.Config.tokens.spm, 0)
  this.spm.on('error', function (err) {
    try {
      SpmAgent.Logger.log('error', 'Error in sendEvent(): ' + err)
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
      }})
  }
  this.forwardEvent = function (dockerEvent) {
    var msgStr = dockerEvent.status + ' ' + (dockerEvent.from || '') + ' ' + dockerEvent.id.substring(0, 12)
    console.log(JSON.stringify({
        _type: 'dockerEvent',
        '@timestamp': dockerEvent.time,
        message: 'Docker Event: ' + msgStr,
        container_id: dockerEvent.id.substring(0, 12),
        image_name: dockerEvent.from,
        event_status: dockerEvent.status
    }))
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
  }
  setTimeout(function () {
    self.docker.version(function (err, data) {
      if (!err) {
        self.sendEvent('docker-info', {message: 'Docker: ' + data.Version + ' API: ' + data.ApiVersion + ' Kernel: ' + data.KernelVersion }, function (err, res) {
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
  this.dockerEvents.start()
  return this
}

module.exports = DockerEventForwarder
