#!/bin/sh

# we only pull once, not every time the server is restarted
# this is to make sure we keep the running code stable for reproducibility 
cd /quicker 
git pull origin draft-20
tsc -p ./

cd /

while true 
do
	echo "DOCKER:startup.sh : Shutting down running node commands"
	pkill -f node
	sleep 2
	echo "DOCKER:startup.sh : Starting Quicker HTTP/3 server at $1:4433"
    node /quicker/out/http/http3/server/demoserver.js $1 4433 &
	# node /quicker/out/main.js $1 4433 /quicker/keys/selfsigned_default.key /quicker/keys/selfsigned_default.crt "$@" &
	sleep 3600
	TIMESTAMP=`date +%d-%m-%y_%H-%M-%S` 
	echo "DOCKER:startup.sh : moving server.log to server_$TIMESTAMP.log"
	mv /logs/server.log "/logs/server_$TIMESTAMP.log"
done