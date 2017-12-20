import { BasePacket, PacketType } from "../base.packet";
import { BaseHeader } from "../header/base.header";
import { BaseFrame } from "../../frame/base.frame";

export class HandshakePacket extends BasePacket {
    
    // can contains Streamframes, ack frames and padding frames
    private frames: BaseFrame[];

    public constructor(header: BaseHeader, frames: BaseFrame[]) {
        super(PacketType.Handshake,header);
        this.frames = frames;
    }

    public getFrames(): BaseFrame[] {
        return this.frames;
    }

    /**
     * Method to get buffer object from a HandshakePacket object
     */
    public toBuffer() {
        if (this.getHeader() === undefined) {
            throw Error("Header is not defined");
        }
        var headerBuffer = this.getHeader().toBuffer();
        
        return headerBuffer;
    }
}