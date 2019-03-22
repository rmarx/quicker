import { BasePacket } from "../packet/base.packet";
import { VerboseLogging } from "../utilities/logging/verbose.logging";




export abstract class PacketPipe{
    /**
     * this function will send the packet to the next pipeline element
     * takes one BasePacket as argument
     */
    public nextPipeFunc : (packet: BasePacket) => any;
    protected debug! : string;

    constructor(){
        this.nextPipeFunc = function(packet : BasePacket){VerboseLogging.error("Calling non-existing pipe function")}
    }



    /**
     * packet comes in here from the previous element in the pipeline, or start of pipeline
     * @param packet 
     */
    public abstract packetIn(packet : BasePacket) : any;

    public setNextPipeFunc(func : (packet: BasePacket) => any, debug:string) : any{
        this.nextPipeFunc = func;
        this.debug = debug;
    }
}