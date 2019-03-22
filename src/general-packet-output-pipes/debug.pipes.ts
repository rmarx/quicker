import { Connection } from "../quicker/connection";
import { PacketPipe } from "../packet-pipeline/packet.pipe.interface";
import { BasePacket } from "../packet/base.packet";
import { Constants } from "../utilities/constants";
import { VerboseLogging } from "../utilities/logging/verbose.logging";
import { PacketType } from '../packet/base.packet';
import { EndpointType } from "../types/endpoint.type";


/**
 * this Pipe class delays the client's handshake packets
 * this leads to 1RTT requests being sent before handshake CLIENT_FINISHED
 * server should buffer the 1RTT request until the handshake is done before replying
 */
export class DEBUGFakeReorderPipe extends PacketPipe{

    private connection : Connection;
    
    constructor(connection : Connection){
        super();
        this.connection = connection;
    }

    
    // this test case delays the client's handshake packets
    // this leads to 1RTT requests being sent before handshake CLIENT_FINISHED
    // server should buffer the 1RTT request until the handshake is done before replying
    public packetIn(packet: BasePacket) {
        let pktNumber = packet.getHeader().getPacketNumber();
        
        if( Constants.DEBUG_fakeReorder && packet.getPacketType() == PacketType.Handshake && this.connection.getEndpointType() == EndpointType.Client ){

            VerboseLogging.warn("fake-reorder:sendPackets : DEBUGGING REORDERED Handshake DATA! Disable this for normal operation!");
            let delayedPacket = packet;

            // Robin start hier//
            // kijk in server logs: opeens sturen we STREAM data in een Handshake packet... geen flauw idee waarom
            setTimeout( () => {
                VerboseLogging.warn("fake-reorder:sendPackets : sending actual Handshake after delay, should arrive after 1-RTT");
                this.nextPipeFunc(delayedPacket);
            }, 500);
        }
        else{
            // NORMAL BEHAVIOUR
            VerboseLogging.info("fake-reorder:sendPackets : actually sending packet : #" + ( pktNumber ? pktNumber.getValue().toNumber() : "VNEG|RETRY") );
            this.nextPipeFunc(packet);
        }         
    }


}