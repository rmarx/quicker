import { PacketPipe } from "../packet-pipeline/packet.pipe.interface";
import { BasePacket } from "../packet/base.packet";
import { VerboseLogging } from "../utilities/logging/verbose.logging";



/**
 * Pipe template
 */
export class TemplatePipe extends PacketPipe{
   
    constructor(){
        super();
    }

    /**
     * 
     * @param packet 
     */
    public packetIn(packet: BasePacket) {
        this.nextPipeFunc(packet);
    }
}