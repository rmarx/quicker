# quicker
NodeJS/TypeScript implementation of the IETF QUIC and HTTP/3 protocols (https://github.com/quicwg).
Maintained by Hasselt University, see quic.edm.uhasselt.be. 

Installation/testing is easiest via the dockerfile (see scripts/docker_setup/main/dockerfile).
Building and launching the docker container can be done via convenience scripts (see scripts/server_config/control/). 
Most of these convenience scripts include hard paths to where we've checked out this repository, so some manual edits will be required to get it running on your system.


The container currently launches the server via this command:
> node /quicker/out/http/http3/server/demoserver.js 127.0.0.1 4433 /quicker/keys/selfsigned_default.key /quicker/keys/selfsigned_default.crt

Launching the client would look like this:
> node /quicker/out/http/http3/client/democlient.js 127.0.0.1 4433


NOTE: the "node" command is from a custom built version of NodeJS, from this repository: https://github.com/rmarx/node/tree/add_quicker_support-draft-18
Instructions for building and installing this custom version before running quicker are in the dockerfile mentioned above. 
QUICker does NOT currently work with other versions of NodeJS!
