import { Connection, RemoteInformation } from "../quicker/connection";
import { PacketPipe } from "../packet-pipeline/packet.pipe.interface";
import { BasePacket, PacketType } from "../packet/base.packet";
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
        logTimeSince("PRE put packet in socket", "packetnum: " + packet.getHeader().getPacketNumber().getValue().toDecimalString() + " @ " + PacketType[ packet.getPacketType() ]);

        let remote : RemoteInformation = this.connection.getRemoteInformation();
        let time1 = Date.now();
        this.connection.getSocket().send(packet.toBuffer(this.connection), remote.port, remote.address);
        /*
        this.connection.getSocket().send(packet.toBuffer(this.connection), remote.port, remote.address, (error, bytes) => {
            let time2 = Date.now();
            let diff = time2 - time1;

            let pnSpace = PacketType[ packet.getPacketType() ];

            VerboseLogging.error("PACKET SENT CALLBACK " + diff + " @ " + pnSpace + "  // " + packet.getHeader().getPacketNumber().getValue().toDecimalString() + " -> " + bytes + " // " + error + ", sendbufsize: " + this.connection.getSocket().getSendBufferSize() );
        });
        */
        logTimeSince("POST put packet in socket", "packetnum: " + packet.getHeader().getPacketNumber().getValue().toDecimalString() + " @ " + PacketType[ packet.getPacketType() ]);
    }


}