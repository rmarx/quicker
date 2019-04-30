import { Connection, RemoteInformation } from "../quicker/connection";
import { PacketPipe } from "../packet-pipeline/packet.pipe.interface";
import { BasePacket } from "../packet/base.packet";
import { VerboseLogging } from "../utilities/logging/verbose.logging";
import { logTimeSince } from "../utilities/debug/time.debug";



/**
 * Puts the packets onto the socket
 * 
 * This class will NOT output packets to the next Pipe in the pipeline
 */
export class SocketOutPipe extends PacketPipe{
    
    private connection : Connection;
    
    constructor(connection : Connection){
        super();
        this.connection = connection;
    }



    public packetIn(packet: BasePacket) {
        let remote : RemoteInformation = this.connection.getRemoteInformation()
        this.connection.getSocket().send(packet.toBuffer(this.connection), remote.port, remote.address);
        logTimeSince("put packet in socket", "packetnum: " + packet.getHeader().getPacketNumber().toString())
    }


}