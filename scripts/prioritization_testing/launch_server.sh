#!/bin/bash

# launch_server.sh PRIORITY_SCHEME TEST_CASE
# e.g., launch_server.sh pmeenan syntheticwijnants
cd ../../
LOG_LEVEL=debug DISABLE_STDOUT=false ../node/out/Release/node --max-old-space-size=8192 --inspect ./out/http/http3/server/demoserver.js $1 $2_$1_server_1 $2_$1_server_1.log prioritization_testcases/$2 public/prioritization_testcases/$2/prioritization_resource_lists/resource_list.json