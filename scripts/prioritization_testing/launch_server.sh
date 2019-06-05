#!/bin/bash

# launch_server.sh PRIORITY_SCHEME TEST_CASE
# e.g., launch_server.sh pmeenan syntheticwijnants
cd ../../
../node/out/Release/node ./out/http/http3/server/demoserver.js $1 $2_$1_server_1 $2_$1_server_1.log prioritization_testcases/$2