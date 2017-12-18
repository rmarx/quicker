import {BaseFrame, FrameType} from '../base.frame';

export class PaddingFrame extends BaseFrame{
    private paddingSize: number;

    public constructor(paddingSize: number) {
        super(FrameType.PADDING);
        this.paddingSize = paddingSize;
    }

    public toBuffer(): Buffer {
        var buffer = Buffer.alloc(this.paddingSize + 1);
        buffer.fill(0);
        buffer.writeUInt8(this.getType(), 0);
        return buffer;
    }
}