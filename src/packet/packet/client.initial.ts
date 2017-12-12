import { BasePacket } from "../base.packet";
import { BaseHeader } from "../header/base.header";

export class ClientInitialPacket extends BasePacket {
    
    public constructor(header: BaseHeader) {
        super( header);
    }

    /**
     * Method to get buffer object from a ClientInitialPacket object
     */
    public toBuffer() {
        if (this.getHeader() === undefined) {
            throw Error("Header is not defined");
        }
        var headerBuffer = this.getHeader().toBuffer();
        
        return headerBuffer;
    }
}