var EventEmitter = require('events').EventEmitter
var util = require('util')
var Logagent = require('@sematext/logagent')
var split2 = require('split2')
var fs = require('fs')
var ld = require('lodash')

function createLogAgent () {
  var patternFile = '/etc/logagent/patterns.yml'
  if (fs.existsSync(patternFile)) {
    console.log(new Date().toISOString() + ' - INFO - Loading custom log parser definitions: ' + patternFile)
    return new Logagent(patternFile)
  } else {
    console.log(new Date().toISOString() + ' - INFO - Use -v /mypattern/patterns.yml:' + patternFile + ' for custom log parser definitions.')
    return new Logagent() // use default patterns
  }
}
function TcpJsonReceiver (port) {
  var net = require('net')
  var ldj = require('line-delimited-json')
  EventEmitter.call(this)
  var self = this

  function handler (client) {
    try {
      var la = createLogAgent()
      var wrappedClient = client.pipe(split2())
      wrappedClient.on('data', function (data) {
        la.parseLine(data, 'journald', function (err, parsedData) {
          if (parsedData) {
            var ldData = ld.transform(parsedData, function (result, val, key) {
              // remove empty fields, but keep boolean false objects
              if (val || val === false) {
                result[key.toLowerCase()] = val
              }
            })
            console.log(ldData)
            self.emit('data', ldData)
          }
        })
      })
      wrappedClient.on('error', console.log)
    } catch (err) {
      console.log(err)
    }
  }
  var server = net.createServer(handler)
  server.listen(port)
  server.on('error', console.log)
  server.on('listening', function () {
    var client = ldj(net.connect(port))
    client.on('error', console.log)
  })
}
util.inherits(TcpJsonReceiver, EventEmitter)

module.exports = TcpJsonReceiver
