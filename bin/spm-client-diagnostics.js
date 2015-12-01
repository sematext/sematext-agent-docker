#!/usr/bin/env node
/*
 * @copyright Copyright (c) Sematext Group, Inc. - All Rights Reserved
 *
 * @licence SPM for Docker is free-to-use, proprietary software.
 * THIS IS PROPRIETARY SOURCE CODE OF Sematext Group, Inc. (Sematext)
 * This source code may not be copied, reverse engineered, or altered for any purpose.
 * This source code is to be used exclusively by users and customers of Sematext.
 * Please see the full license (found in LICENSE in this distribution) for details on its license and the licenses of its dependencies.
 */
var fs = require('fs')
var AdmZip = require('adm-zip')
var zip = new AdmZip()
var config = require('spm-agent').Config
var util = require('util')
var ls = require('ls')
var os = require('os')
var path = require('path')

var dockerInfo = {}

try {
	dockerInfo = fs.statSync ('/var/run/docker.sock')
} catch (ex) {
	dockerInfo = ex
}
var systemInfo = {
  operatingSystem: os.type() + ', ' + os.platform() + ', ' + os.release() + ', ' + os.arch(),
  processVersions: process.versions,
  processEnvironment: process.env,
  dockerSocketInfo: dockerInfo
}

var cfgDumpFileName = path.join(os.tmpdir(), 'spm-cfg-dump.txt')
fs.writeFileSync(cfgDumpFileName, util.inspect(config).toString() + '\nSystem-Info:\n' + util.inspect(systemInfo))
console.log(util.inspect(config).toString() + '\nSystem-Info:\n' + util.inspect(systemInfo))
var logfiles = ls(config.logger.dir + '/*')
zip.addLocalFile(cfgDumpFileName)
console.log ('Adding file ' + cfgDumpFileName)
logfiles.forEach(function (f) {
  console.log ('Adding file ' + f.file )
  zip.addLocalFile(f.full)
})
var archFileName = os.tmpdir() + 'spm-diagnose.zip'
zip.writeZip(archFileName)
console.log('SPM diagnostics info is in  ' + archFileName)
console.log('Please e-mail the file to spm-support@sematext.com')
fs.unlink(cfgDumpFileName, function () {})
