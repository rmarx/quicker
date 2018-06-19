import { BaseFrame, FrameType } from "./base.frame";

// see https://tools.ietf.org/html/draft-ietf-quic-transport#section-7.9
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