import {BaseFrame, FrameType} from './base.frame';
import {Bignum} from '../types/bignum';
import {VLIE} from '../crypto/vlie';


export class StreamIdBlockedFrame extends BaseFrame {
    private streamID: Bignum;

	public constructor(streamID: Bignum) {
        super(FrameType.STREAM_ID_BLOCKED);
        this.streamID = streamID;
    }
    
    public toBuffer(): Buffer {
        var offset = 0;
        var streamIDBuffer: Buffer = VLIE.encode(this.streamID);
        var returnBuffer: Buffer = Buffer.alloc(streamIDBuffer.byteLength + 1);
        returnBuffer.writeUInt8(this.getType(), offset++);
        streamIDBuffer.copy(returnBuffer, offset);
        return returnBuffer;
    }

    public getStreamId(): Bignum {
        return this.streamID;
    }
}