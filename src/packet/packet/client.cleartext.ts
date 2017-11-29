import { BasePacket, PacketType } from "../base.packet";
import { BaseHeader } from "../header/base.header";

export class ClientCleartextPacket extends BasePacket {
    
    public constructor(header: BaseHeader) {
        super(PacketType.ClientCleartext, header);
    }

    /**
     * Method to get buffer object from a ClientCleartextPacket object
     */
    public toBuffer() {
        if (this.getHeader() === undefined) {
            throw Error("Header is not defined");
        }
        var headerBuffer = this.getHeader().toBuffer();
        
        return headerBuffer;
    }
}