#!/bin/sh


cd /quicker 
git pull origin congestionControl
tsc -p ./

cd /

echo "DOCKER:startup.sh : Shutting down running node commands"
pkill -f node
sleep 2
BANDWIDTH="10kbps"
LOSSRATE="1"
LATENCY="30ms"
if [ ! -z "$1" ]
then
    echo "setting bandwidth to $1"
    BANDWIDTH=$1
fi
if [ ! -z "$2" ]
then
    echo "setting lossrate to $2"
    LOSSRATE=$2
fi
if [ ! -z "$3" ]
then
    echo "setting latency to $3"
    LATENCY=$3
fi
echo $BANDWIDTH
echo $LOSSRATE
echo $LATENCY
tc qdisc replace dev lo root netem rate $BANDWIDTH loss $LOSSRATE delay $LATENCY


echo "netem settings bw $BANDWIDTH loss $LOSSRATE  latency $LATENCY" > "/logs/netem_settings"

tcpdump -U -i lo -w quicker.pcap &   
sleep 5

echo "DOCKER:startup.sh : Starting Quicker server at 127.0.0.1:4433"
node /quicker/out/main.js 127.0.0.1 4433 /quicker/keys/selfsigned_default.key /quicker/keys/selfsigned_default.crt &
sleep 360

