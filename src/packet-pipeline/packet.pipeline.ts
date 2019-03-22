import { PacketPipe } from "./packet.pipe.interface";
import { BasePacket } from "../packet/base.packet";
import { VerboseLogging } from "../utilities/logging/verbose.logging";


/**
 * This class is used to contain and line up all operations that need to be done on outgoing packets.
 * It should simplify implementing and also abstract features like a Pacer or the Coalescing of packets.
 * 
 * Implementing test cases is simpler via this too, see "src/general-packet-output-pipes/debug.pipes.ts" for an example where
 * handshake packets get reordered.
 */
//Pacer: https://tools.ietf.org/html/draft-ietf-quic-recovery-18#section-7.7
//Coalescing: https://tools.ietf.org/html/draft-ietf-quic-transport-18#section-12.2
export class PacketPipeline{

    private pipes : PacketPipe[];


    constructor(){
        this.pipes = [];
    }


    /**
     * add pipe to the pipeline
     * init the "nextPipeFunction" of the previously added Pipe to the packetIn of the new Pipe
     */
    public addPipe(pipe : PacketPipe){
        if(this.pipes.length > 0){
            this.pipes[this.pipes.length - 1].setNextPipeFunc(pipe.packetIn.bind(pipe), pipe.constructor.name);
        }
        this.pipes.push(pipe);        
    }


    /**
     * generic startpoint of the packet pipeline
     * @param packet packet to be sent
     */
    public packetIn(packet : BasePacket){
        if(this.pipes.length > 0){
            this.pipes[0].packetIn(packet);
        }
        else{
            VerboseLogging.error("PacketPipeline: Attempting to send packets into an empty pipeline");
        }
    }


    /**
     * generic startpoint of the packet pipeline
     * @param packetArray list of packets to be sent
     */
    public packetsIn(packetArray : BasePacket[]){
        if(this.pipes.length > 0){
            packetArray.forEach( (packet : BasePacket) => this.pipes[0].packetIn(packet));            
        }
        else{
            VerboseLogging.error("PacketPipeline: Attempting to send packets into an empty pipeline");
        }
    }

}