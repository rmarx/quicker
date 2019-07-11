#!/bin/sh

# this file is built-in to the docker container
# its main purpose is to check out the repository and then launch the actual startup script, that is in the repository
# by splitting it up like this, we can update startup.sh without having to rebuild our docker container all the time
# TODO: figure out a way to do this even if we've changed main branches... e.g., use curl to see what the current "main" branch is on github

cd /quicker 
git pull origin draft-20

# chmod sometimes takes too long, causing the .sh script to not be executed ("Text file is busy" bug)
# sync helps by waiting for chmod to fully complete
chmod +x /quicker/scripts/docker_setup/main/startup.sh
sync
/quicker/scripts/docker_setup/main/startup.sh "$@"
