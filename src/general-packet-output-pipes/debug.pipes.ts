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


//-------------------------------------------------------------------------------------------------------------------------





/**
 * Randomly "drops" packets according to the percentage
 */
export class DEBUGRandomDrop extends PacketPipe{

    // 0.7 == 70%
    private percentSucces : number = 0.7;
   
    constructor(){
        super();
    }

    /**
     * 
     * @param packet 
     */
    public packetIn(packet: BasePacket) {
        if(Math.random() < this.percentSucces){
            this.nextPipeFunc(packet);
        }
    }
}




//-------------------------------------------------------------------------------------------------------------------------





/**
 * "drops" every xth packet
 * will not drop handshake packets
 */
export class DEBUGDropEveryXth extends PacketPipe{

    // every 10th packets gets dropped
    private everyX : number = 2;
    private count : number;
   
    constructor(){
        super();
        this.count = 0;
    }

    /**
     * 
     * @param packet 
     */
    public packetIn(packet: BasePacket) {
        this.count = this.count + 1;
        if(this.count % this.everyX !== 0 || packet.isHandshake()){
            this.nextPipeFunc(packet);
        }
        else{
            VerboseLogging.warn("DROPPING PACKET FOR DEBUG, SHOULD NOT BE ENABLED OUTSIDE OF TESTING");
        }
    }
}




//-------------------------------------------------------------------------------------------------------------------------



/**
 * "drops" every packet after the xth, for y packets
 */
export class DEBUGPersistentCongestionAfterX extends PacketPipe{

    // every 10th packets gets dropped
    private afterX : number = 5;
    private forY : number = 50;
    private count : number;
   
    constructor(){
        super();
        this.count = 0;
    }

    /**
     * 
     * @param packet 
     */
    public packetIn(packet: BasePacket) {
        this.count = this.count + 1;
        if(this.count < this.afterX && this.count > this.afterX + this.forY){
            this.nextPipeFunc(packet);
        }
    }
}




//-------------------------------------------------------------------------------------------------------------------------


/**
 * NOTE, if both endpoints are a copy of eachother, (and thus both use this pipe) it will be double rtt delay
 */
export class DEBUGIncreaseRTT extends PacketPipe{

     // wait for this many ms before sending
     private waitMS : number = 5;

    
     constructor(){
         super();
         
     }
 
     /**
      * 
      * @param packet 
      */
     public packetIn(packet: BasePacket) {

            setTimeout(() => { 
                this.nextPipeFunc(packet);
            }, this.waitMS);
    }
}


//-------------------------------------------------------------------------------------------------------------------------


export class DEBUGSingleDropServerOnly extends PacketPipe{

    private packetCountX : number = 25;
    private count : number;
    private connection: Connection;

    constructor(connection: Connection){
        super();
        this.count = 0;
        this.connection = connection;
    }

    /**
     * 
     * @param packet 
     */
    public packetIn(packet: BasePacket) {
        this.count = this.count + 1;
        if(this.connection.getEndpointType() === EndpointType.Client){
            this.nextPipeFunc(packet);
        }
        else if(this.count < this.packetCountX || this.count > this.packetCountX){
            this.nextPipeFunc(packet);
        }
        else{
            //caching the size......
            packet.toBuffer(this.connection);
            VerboseLogging.warn("DROPPING PACKET BY DEBUGSingleDropServerOnly, SHOULD NOT BE ENABLED OUTSIDE DEBUGGING")
        }
    }
}