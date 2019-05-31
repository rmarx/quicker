#!/bin/sh



cd /

echo "DOCKER:startup.sh : Shutting down running node commands"
pkill -f node
sleep 2
BANDWIDTH="10kbit"
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

tcpdump -U -i lo -w tcp.pcap &   
sleep 5

echo "starting server"
node server.js &
sleep 5

echo "starting client"
node client.js &
process_id=$!
wait $!


TIMESTAMP=`date +%d-%m-%y_%H-%M-%S` 
echo "DOCKER:startup.sh : moving server.log to server_$TIMESTAMP.log"
mv tcp.log "/logs/tcp_$TIMESTAMP.log"


#get tcpdump pid
pid=$(ps -e | pgrep tcpdump)  
echo $pid  

#kill it
sleep 5
kill -2 $pid
mv tcp.pcap "/logs/tcp_$TIMESTAMP.pcap"