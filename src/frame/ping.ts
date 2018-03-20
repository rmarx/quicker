import { BaseFrame, FrameType } from "./base.frame";


abstract class BasePingFrame extends BaseFrame {
    private length: number;
    private data: Buffer;


    public constructor(type: FrameType, length: number, data: Buffer) {
        super(type, true);
        this.length = length;
        this.data = data;
    }

    public toBuffer(): Buffer {
        var buffer = Buffer.alloc(25);
        buffer.writeUInt8(this.getType(), 0);
        buffer.writeUInt8(this.length, 1);
        this.data.copy(buffer, 2);
        return buffer;
    }

    public getLength(): number {
        return this.length;
    }

    public getData(): Buffer {
        return this.data;
    }
}

export class PingFrame extends BasePingFrame {
    public constructor(length: number, data: Buffer) {
        super(FrameType.PING, length, data);
    }
}

export class PongFrame extends BasePingFrame {
    public constructor(length: number, data: Buffer) {
        super(FrameType.PONG, length, data);
    }
}