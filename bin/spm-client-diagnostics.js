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
var systemInfo = {}
function printDockerInfo (err, info) {
  if (!err) {
    dockerInfo.dockerInfo = info
  }
  createZipFile()
}
try {
  dockerInfo.socketDetails = fs.statSync('/var/run/docker.sock')
  systemInfo = {
    operatingSystem: os.type() + ', ' + os.platform() + ', ' + os.release() + ', ' + os.arch(),
    processVersions: process.versions,
    processEnvironment: process.env,
    dockerInfo: dockerInfo
  }
  var Docker = require('dockerode')
  var docker = new Docker()
  docker.info(printDockerInfo)
} catch (ex) {
  dockerInfo = ex
  console.log(ex)
  createZipFile()
}

function createZipFile () {
  var cfgDumpFileName = path.join(os.tmpdir(), 'spm-cfg-dump.txt')
  var logfiles = ls(config.logger.dir + '/*')
  console.log('Adding file ' + cfgDumpFileName)
  logfiles.forEach(function (f) {
    console.log('Adding file ' + f.file)
    zip.addLocalFile(f.full)
  })
  console.log(util.inspect(config).toString() + '\nSystem-Info:\n' + util.inspect(systemInfo))
  fs.writeFileSync(cfgDumpFileName, util.inspect(config).toString() + '\nSystem-Info:\n' + util.inspect(systemInfo))
  zip.addLocalFile(cfgDumpFileName)
  var archFileName = path.join(os.tmpdir(), 'spm-diagnose.zip')
  zip.writeZip(archFileName)
  console.log('SPM diagnostics info is in  ' + archFileName)
  console.log('Please e-mail the file to spm-support@sematext.com')
  fs.unlink(cfgDumpFileName, function () {})
}
