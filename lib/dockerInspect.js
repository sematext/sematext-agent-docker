#!/usr/bin/env node
var Docker = require('dockerode')
var docker = new Docker()
var flat = require('flat')
var minimatch = require('minimatch')

var cache = {}

var tagIds = []
if (process.env.TAGGING_LABELS) {
  tagIds = process.env.TAGGING_LABELS.split(',')
}

function getEnvVar (name, list) {
  if (!list) {
    return null
  }
  if (!(list instanceof Array)) {
    var keys = Object.keys(list)
    for (var k = 0; k < keys.length; k++) {
      if (keys[k].indexOf(name) > -1) {
        return list[keys[k]].trim()
      }
    }
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

function getValue (name, list, info) {
  if (!list) {
    return null
  }
  if (!(list instanceof Array)) {
    var keys = Object.keys(list)
    for (var k = 0; k < keys.length; k++) {
      if (minimatch(keys[k], name)) {
        if (!info.tags) {
          info.tags = {}
        }
        info.tags[keys[k].replace(/\./g, '_')] = list[keys[k]]
        info.tags
      }
    }
  }
  for (var i = 0; i < list.length; i++) {
    if (minimatch(list[i], name)) {
      var value = list[i].split('=')
      if (value.length > 1) {
        if (!info.tags) {
          info.tags = {}
        }
        info.tags[value[0].replace(/\./g, '_')] = value[1]
      }
    }
  }
  return null
}

function extractLoggingTags (labels, env, info) {
  // console.log(info)
  if (tagIds.length > 0) {
    for (var i = 0; i < tagIds.length; i++) {
      getValue(tagIds[i] + '*', labels, info)
      getValue(tagIds[i] + '*', env, info)
    }
  }
}

function getLogseneToken (err, info) {
  var token = null
  if (!err) {
    extractLoggingTags(info.Config.Labels, info.Config.Env, info)
    if (info.Config && info.Config.Labels && info.Config.Labels.LOGSENE_ENABLED !== undefined) {
      info.LOGSENE_ENABLED = info.Config.Labels.LOGSENE_ENABLED
    } else {
      info.LOGSENE_ENABLED = getEnvVar('LOGSENE_ENABLED', info.Config.Env)
    }
    if (info.LOGSENE_ENABLED === '0' || info.LOGSENE_ENABLED === 'false' || info.LOGSENE_ENABLED === 'no') {
      console.log('Container ' + info.Id + ' ' + info.Name + ' setting LOGSENE_ENABLED=false')
      info.LOGSENE_ENABLED = false
    } else {
      info.LOGSENE_ENABLED = true
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
