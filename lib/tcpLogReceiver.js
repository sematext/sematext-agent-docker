var EventEmitter = require('events').EventEmitter
var util = require('util')

function TcpJsonReceiver (port) {
  var net = require('net')
  var ldj = require('line-delimited-json')
  EventEmitter.call(this)
  var self = this

  function handler (client) {
    try {
      var wrappedClient = ldj(client)
      wrappedClient.on('data', function (data) {
        self.emit('data', data)
      })
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

