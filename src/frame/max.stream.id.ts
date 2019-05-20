import {BaseFrame, FrameType} from './base.frame';
import {Bignum} from '../types/bignum';
import {VLIE} from '../types/vlie';


export class MaxStreamIdFrame extends BaseFrame {
    private maxStreamID: Bignum

	public constructor(type:FrameType.MAX_STREAMS_BIDI|FrameType.MAX_STREAMS_UNI, maxStreamID: Bignum) {
        super(type, true);
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