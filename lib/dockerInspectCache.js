'use strict'
var getLogseneTokenByContainer = require('./dockerInspect')
var Docker = require('dockerode')
var DockerEvents = require('docker-events')
function DockerInspectCache () {
  this.dockerInspectCache = {}
  this.initDockerEventHandlers()
}

DockerInspectCache.prototype.initDockerEventHandlers = function () {
  this.docker = new Docker()
  this.dockerEvents = new DockerEvents({docker: this.docker})
  var dockerInspectCache = this.dockerInspectCache
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

module.exports = new DockerInspectCache()
