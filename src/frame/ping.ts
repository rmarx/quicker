import { BaseFrame, FrameType } from "./base.frame";


export class PingFrame extends BaseFrame {

    public constructor() {
        super(FrameType.PING, true);
    }

    public toBuffer(): Buffer {
        var buffer = Buffer.alloc(25);
        buffer.writeUInt8(this.getType(), 0);
        return buffer;
    }
}