import {BaseFrame, FrameType} from './base.frame';
import {Bignum} from '../types/bignum';
import {VLIE} from '../crypto/vlie';


export class MaxStreamIdFrame extends BaseFrame {
    private maxStreamID: Bignum

	public constructor(maxStreamID: Bignum) {
        super(FrameType.MAX_STREAM_ID, true);
        this.maxStreamID = maxStreamID;
	}
    
    public toBuffer(): Buffer {
        var maxStreamIDBuffer: Buffer = VLIE.encode(this.maxStreamID);
        var returnBuffer: Buffer = Buffer.alloc(maxStreamIDBuffer.byteLength + 1);
        returnBuffer.writeUInt8(this.getType(), 0);
        maxStreamIDBuffer.copy(returnBuffer, 1);
        return returnBuffer;
    }

    public getMaxStreamId(): Bignum {
        return this.maxStreamID;
    }
}