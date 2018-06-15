#!/bin/bash

# NOT CURRENTLY FULLY RUNNABLE FROM THIS SCRIPT
# copy-paste these commands and execute them near the correct Dockerfile's (1st one is the custom node repo, 2nd one the quicker repo)
sudo docker build -t node:qtls latest .

# copy scripts/docker/Dockerfile to the top-level dir (next to package.json) then run this command there 
# Dockerfile should contain:
# FROM node:qtls

# # to generate new self-signed cert for testing 
# # openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout keys/temp.key -out keys/temp.crt

# RUN npm install typescript -g

# WORKDIR /server

# COPY . /server
# RUN npm install

# RUN tsc -p ./

# EXPOSE 4433
# #CMD [ "node", "/server/out/main.js" ]
# CMD [ "node", "/server/out/main.js", "127.0.0.1", "4433", "./keys/selfsigned_default.key", "./keys/selfsigned_default.crt" ]
# #CMD [ "tail", "-f", "/dev/null" ]

sudo docker build -t quicker/quicker:latest .


# to run afterwards:
# sudo docker stop quicker && sudo docker rm quicker 
# sudo docker run --privileged --name quicker -d quicker/quicker:latest "$@"

# get into container
# sudo docker exec -it quicker bash 
# -> do this 2 times, one for server, one for client 

# server
# sudo ./server/start_server.sh
# client 
# sudo ./client/start_client.sh 