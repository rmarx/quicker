
pkill -f node
sleep 2


TIMESTAMP=`date +%d-%m-%y_%H-%M-%S` 
echo "DOCKER:startup.sh : moving server.log to server_$TIMESTAMP.log"
mv /logs/server.log "/logs/server_$TIMESTAMP.log"


#get tcpdump pid
pid=$(ps -e | pgrep tcpdump)  
echo $pid  

#kill it
sleep 5
kill -2 $pid
mv quicker.pcap "/logs/server_$TIMESTAMP.pcap"

mkdir --parents "/logs/quicker_netem_logs_$TIMESTAMP"

find /logs/ -maxdepth 1 -type f -print0 | xargs -0 mv -t "/logs/quicker_netem_logs_$TIMESTAMP"