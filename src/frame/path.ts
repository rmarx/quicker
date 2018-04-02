import { BaseFrame, FrameType } from "./base.frame";


abstract class BasePathFrame extends BaseFrame {

    private data: Buffer;

    public constructor(type: FrameType, data: Buffer) {
        super(type, true);
        this.data = data;
    }

    public toBuffer(): Buffer {
        var buffer = Buffer.alloc(10);
        buffer.writeUInt8(this.getType(), 0);
        this.data.copy(buffer, 1);
        return buffer;
    }

    public getData(): Buffer {
        return this.data;
    }
}

export class PathChallengeFrame extends BasePathFrame {
    public constructor(data: Buffer) {
        super(FrameType.PATH_CHALLENGE, data);
    }
}

export class PathResponseFrame extends BasePathFrame {
    public constructor(data: Buffer) {
        super(FrameType.PATH_RESPONSE, data);
    }
}