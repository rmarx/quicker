#!/bin/bash

# launch_client.sh PRIORITY_SCHEME TEST_CASE
# e.g., launch_client.sh pmeenan syntheticwijnants
cd ../../
LOG_LEVEL=debug DISABLE_STDOUT=false ../node/out/Release/node --max-old-space-size=8192 ./out/http/http3/client/democlient.js $2_$1_client_1 $2_$1_client_1.log public/prioritization_testcases/$2/prioritization_resource_lists/resource_list.json