#!/usr/bin/env node
var Docker = require('dockerode')
var docker = new Docker()
var flat = require('flat')
var cache = {}

function getLogseneToken(err, info) {
	if (Object.keys(cache).length > 1000)
	{
		// avoid memory leak whith old containers
		// todo: maintain cache with Docker Events
		cache = {}
	}
	if(!err)
	{
		if(info.Config && info.Config.Labels && info.Config.Labels.LOGSENE_TOKEN)
		{
			cache[this.container] = info
			return this.callback(null, info.Config.Labels.LOGSENE_TOKEN)
		} else {
			return this.callback(null, process.env.LOGSENE_TOKEN)
		}
	} else {
		return this.callback(null, process.env.LOGSENE_TOKEN)	
	}		
}

function getLogseneTokenForContainer (id, cb) {
	if(cache[id])
	{
		cb(err, info.Config.Labels.LOGSENE_TOKEN || process.env.LOGSENE_TOKEN)
	}
	docker.getContainer(id).inspect(getLogseneToken.bind({
		callback: cb,
		container: id
	}))
}

module.exports = getLogseneTokenForContainer

/*
getLogseneTokenForContainer(process.argv[2], function () {
	console.log(arguments)
})*/