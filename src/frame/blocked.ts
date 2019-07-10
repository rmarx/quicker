import {VLIE} from '../types/vlie';
import {Bignum} from '../types/bignum';
import {BaseFrame, FrameType} from './base.frame';



export class BlockedFrame extends BaseFrame {
    private blockedOffset: Bignum;

	public constructor(blockedOffset: Bignum) {
        super(FrameType.DATA_BLOCKED, true);
        this.blockedOffset = blockedOffset;
    }
    
    public toBuffer(): Buffer {
        var blockedBuffer: Buffer = VLIE.encode(this.blockedOffset);
        var returnBuffer: Buffer = Buffer.alloc(blockedBuffer.byteLength + 1);
        returnBuffer.writeUInt8(this.getType(), 0);
        blockedBuffer.copy(returnBuffer, 1);
        return returnBuffer;
    }

    public getBlockedOffset(): Bignum {
        return this.blockedOffset;
    }
}