#!/usr/bin/env node
var Docker = require('dockerode')
var docker = new Docker()
var flat = require('flat')
var cache = {}

function getEnvVar (name, list) {
  if (!list) {
    return null
  }
  for (var i = 0; i < list.length; i++) {
    if (list[i].indexOf(name) > -1) {
      var token = list[i].split('=')
      if (token && token.length > 1 && token[1]) {
        token = token[1]
        if (token.length > 35) {
          return token.trim()
        }
      }
    }
  }
  return null
}
function getLogseneToken (err, info) {
  var token = null
  if (!err) {
    if (info.Config && info.Config.Labels && info.Config.Labels.LOGSENE_ENABLED !== undefined) {
      info.LOGSENE_ENABLED = info.Config.Labels.LOGSENE_ENABLED
      if (info.LOGSENE_ENABLED === '0' ||
        info.LOGSENE_ENABLED === 'false' ||
        info.LOGSENE_ENABLED === 'no') {
        info.LOGSENE_ENABLED = false
        console.log('Container ' + info.Id + ' ' + info.Name + ' setting LOGSENE_ENABLED=false')
      } else {
        info.LOGSENE_ENABLED = true
      }
    } else {
      info.LOGSENE_ENABLED = getEnvVar('LOGSENE_ENABLED', info.Config.Env)
      if (info.LOGSENE_ENABLED === '0' ||
        info.LOGSENE_ENABLED === 'false' ||
        info.LOGSENE_ENABLED === 'no') {
        info.LOGSENE_ENABLED = false
        console.log('Container ' + info.Id + ' ' + info.Name + ' setting LOGSENE_ENABLED=false')
      } else {
        info.LOGSENE_ENABLED = true
      }
    }
    if (info.Config && info.Config.Labels && info.Config.Labels.LOGSENE_TOKEN) {
      token = info.Config.Labels.LOGSENE_TOKEN
      info.LOGSENE_TOKEN = token
    } else {
      token = getEnvVar('LOGSENE_TOKEN', info.Config.Env)
    }
  }
  if (info) {
    info.LOGSENE_TOKEN = token || process.env.LOGSENE_TOKEN
    this.callback(null, info)
  } else {
    this.callback(null, {
      LOGSENE_TOKEN: process.env.LOGSENE_TOKEN,
      id: this.container
    })
  }
}

function getLogseneTokenForContainer (id, cb) {
  docker.getContainer(id).inspect(getLogseneToken.bind({
    callback: cb,
    container: id
  }))
}

module.exports = getLogseneTokenForContainer
