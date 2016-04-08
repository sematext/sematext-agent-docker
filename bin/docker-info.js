#!/usr/bin/env node
var Docker = require('dockerode')
var docker = new Docker()
function print(err, info) {
	if (err)
		return console.log(err)
	else 
		console.log (info[process.argv[2]])
}
docker.info(print)