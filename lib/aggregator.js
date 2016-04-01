/*
 * @copyright Copyright (c) Sematext Group, Inc. - All Rights Reserved
 *
 * @licence SPM for Docker is free-to-use, proprietary software.
 * THIS IS PROPRIETARY SOURCE CODE OF Sematext Group, Inc. (Sematext)
 * This source code may not be copied, reverse engineered, or altered for any purpose.
 * This source code is to be used exclusively by users and customers of Sematext.
 * Please see the full license (found in LICENSE in this distribution) for details on its license and the licenses of its dependencies.
 */
'use strict'
var Measured = require('measured')

var Aggregator = function (metricCallback) {
  this.metrics = {}
  this.lastValues = {}
  this.metricCallback = metricCallback
}

Aggregator.prototype.update = function (timestamp, name, value, calcDiff) {
  if(isNaN(value)) {
    return
  }
  if (this.metrics[name] === undefined) {
    this.metrics[name] = new Measured.Histogram()
  }
  if (!this.lastValues[name]) {
    this.lastValues[name] = {value: value, ts: timestamp}
  }
  if (calcDiff === true) {
    var diff = value - this.lastValues[name].value
    this.metrics[name].update(diff, timestamp)
    this.lastValues[name] = {value: value, ts: timestamp}
  } else {
    this.metrics[name].update(value, timestamp)
  }
}

Aggregator.prototype.get = function (name) {
  if (this.metrics[name] !== undefined) {
    var rv = this.metrics[name].toJSON()
    rv.name = name
    this.metrics[name].reset()
    this.lastValues[name]=null
    return rv
  } else {
    return {count: 0, sum: 0, mean: 0, err: 'no metrics object for ' + name}
  }
}

Aggregator.prototype.reset = function () {
  this.metrics = null
  this.metrics = {}
}

module.exports = Aggregator
