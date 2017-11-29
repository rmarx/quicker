import { BasePacket, PacketType } from "../base.packet";
import { BaseHeader } from "../header/base.header";


export class ServerStatelessRetryPacket extends BasePacket {
    
    public constructor(header: BaseHeader) {
        super(PacketType.ServerStatelessRetry, header);
    }

    /**
     * Method to get buffer object from a ServerStatelessRetryPacket object
     */
    public toBuffer() {
        if (this.getHeader() === undefined) {
            throw Error("Header is not defined");
        }
        var headerBuffer = this.getHeader().toBuffer();
        
        return headerBuffer;
    }
}