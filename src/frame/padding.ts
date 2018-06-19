import {BaseFrame, FrameType} from './base.frame';

export class PaddingFrame extends BaseFrame{
    private paddingLength: number;

    public constructor(paddingSize: number) {
        super(FrameType.PADDING, false);
        this.paddingLength = paddingSize;
    }

    public toBuffer(): Buffer {
        // Padding frames don't have a length of their own, as they are expected to always be at the end of a Packet and fill the full packet
        var buffer = Buffer.alloc(this.paddingLength + 1);
        buffer.fill(0);
        buffer.writeUInt8(this.getType(), 0);
        return buffer;
    }

    public getLength(): number {
        return this.paddingLength;
    }
}