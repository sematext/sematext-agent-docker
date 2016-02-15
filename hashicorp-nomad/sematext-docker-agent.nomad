# Run Job Definition: nomad run sematext-agent-docker.nomad
# https://www.hashicorp.com/blog/nomad.html
# More Info: https://hub.docker.com/r/sematext/sematext-agent-docker/
# http://blog.sematext.com/2015/12/15/docker-logging-partner-sematext-logsene/
job "sematext-agent-docker" {
	# set your region here
	region = "global"
	# Mandatory, parameter pls. change!
	datacenters = ["us-west-1"]
    	# run this job globally
    	type = "system" 
	group "infra" {
	task "sematext-agent-docker" {
		driver = "docker"
		config {
			image = "sematext/sematext-agent-docker"
			privileged: true
		}
		env {
			# Create App Tokens here: https://apps.sematext.com
			SPM_TOKEN="YOUR_SPM_TOKEN"
			LOGSENE_TOKEN="YOUR_LOGSENE_TOKEN"
		}
	}
}
