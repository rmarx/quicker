#!/bin/bash

# must be run in basedirectory of quicker
# node directory must be in the parentdir 
cd ../node
./configure
make 
make -C out BUILDTYPE=Debug
cd ../quicker
tsc -p ./
clear
clear
NODE_DEBUG=qtls ./../node/out/Release/node ./out/main.js $1 $2 $3 $4
