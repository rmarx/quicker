#!/bin/bash

if [ -z "$1" ]
then
	echo "Need to pass in IP to listen on as first parameter. Usually: ./start_server.sh 0.0.0.0"
	exit 1
fi

# typical way to call this: ./start_server.sh

echo "First shutting down running containers (if they exist), then starting new quicker/quicker:latest container."

sudo docker stop quicker_server && sudo docker rm quicker_server  
sudo docker run --privileged --restart unless-stopped --name quicker_server -p 4433:4433/udp -p 4434:4434/udp -p 4435:4435/udp --volume=/home/speeder/htdocs/quic/quicker/logs:/logs -d quicker/quicker:latest "$@"

echo "Now run    sudo docker logs -f quicker_server    to view output, or    sudo docker exec -it quicker_server bash    to login to container"