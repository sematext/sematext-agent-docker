'use strict'
var util = require('util')
var Docker = require('dockerode')
var d = new Docker()
var lastQuery = Date.now()
var statusCounters = {tasksInDesiredState: 0, tasksNotInDesiredState: 0}
var EE = require('events').EventEmitter
var errorCount = 0

function TaskMonitor (opts) {
  this.opts = opts
  this.lastQuery = Date.now()
  this.taskMetrics = {}
  EE.call(this)
}
util.inherits(TaskMonitor, EE)

TaskMonitor.prototype.start = function () {
  // run once after the start
  setTimeout(this.listTasks.bind(this), 1000)
  // then run once a minute
  this.tid = setInterval(this.listTasks.bind(this), 60000)
}

TaskMonitor.prototype.transform = function (task) {
  /* Example:
  ServiceID:    1ge174p6mjx2datayv771rqf8
  Slot:         71
  NodeID:       e7herumhadti45itzlvsli6yu
  Status:
    Timestamp:       2016-09-27T11:21:26.799061643Z
    State:           running
    Message:         started
    ContainerStatus:
      ContainerID: fbcd32e0bdb7ab22df01ac58efd242127a3ecadd628aff44a211a5d90ffd2912
      PID:         26907
  DesiredState: running
  */
  var result = {_type: 'swarmTask'}
  result.originalTask = task
  result['@timestamp'] = new Date(task.UpdatedAt || task.CreatedAt)
  result.createAt = new Date(task.CreatedAt)
  result.updatedAt = result['@timestamp']
  result.taskId = task.ID
  result.nodeId = task.NodeID
  result.serviceId = task.ServiceID
  result.slot = Number(task.Slot) || -1
  result.desiredState = task.DesiredState
  if (task.Status && task.Status.Timestamp) {
    result['@timestamp'] = new Date(task.Status.Timestamp)
    result.status = {
      state: String(task.Status.State),
      message: String(task.Status.Message)
    }
    var key = 'task_' + result.status.state
    statusCounters[key] = (statusCounters[key] || 0) + 1
    if (task.Status && task.ContainerStatus && task.ContainerStatus.ContainerID) {
      result.container_id = task.ContainerStatus.ContainerID.substring(0, 12)
    }
    if (task.Status.Err || task.Status.Error) {
      result.status.error = task.Status.Err || task.Status.Error
    }
    result.isInDesiredState = Number(task.Status.State === task.DesiredState)
    if (result.isInDesiredState) {
      statusCounters['task_in_desired_state'] = (statusCounters['task_in_desired_state'] || 0) + 1
    } else {
      statusCounters['task_in_desired_state'] = statusCounters['task_not_in_desired_state'] + 1
    }
  }
  return result
}
TaskMonitor.prototype.aggregateTasks = function (err, data) {
  if (err) {
    this.emit('httpError', err)
    errorCount++
    if (errorCount > 3 && this.tid) {
      clearInterval(this.tid)
    }
    return
  }
  var self = this
  var lq = lastQuery
  lastQuery = Date.now()
  statusCounters = {task_in_desired_state: 0, task_not_in_desired_state: 0, _type: 'swarmTaskStats'}
  for (var i = 0; i < data.length; i++) {
    var task = self.transform(data[i])
    if (new Date(data[i].UpdatedAt).getTime() >= lq) {
      self.emit('taskUpdate', task)
      if (task.status.error) {
        self.emit('taskError', task)
      }
    }
  }
  self.emit('taskMetrics', statusCounters)
}

TaskMonitor.prototype.listTasks = function () {
  d.listTasks(
    // { path: '/tasks?node=' + this.opts.nodeId },
    this.aggregateTasks.bind(this))
}

TaskMonitor.prototype.test = function (opts, done) {
  var tm = new TaskMonitor(opts)
  tm.once('taskMerics', function (m) {
    console.log(m)
    done()
  })
  tm.once('taskUpdate', console.log)
  tm.once('taskError', console.error)
  tm.once('httpError', done)
  return tm
}

module.exports = TaskMonitor
