import {BaseFrame, FrameType} from './base.frame';
import {Bignum} from '../types/bignum';
import {VLIE} from '../types/vlie';



export class StreamBlockedFrame extends BaseFrame {
    private streamID: Bignum;
    private blockedOffset: Bignum;

	public constructor(streamID: Bignum, blockedOffset: Bignum) {
        super(FrameType.STREAM_DATA_BLOCKED, true);
        this.streamID = streamID;
        this.blockedOffset = blockedOffset;
    }
    
    public toBuffer(): Buffer {
        var offset = 0;
        var streamIDBuffer: Buffer = VLIE.encode(this.streamID);
        var blockedOffsetBuffer: Buffer = VLIE.encode(this.blockedOffset);
        var returnBuffer: Buffer = Buffer.alloc(streamIDBuffer.byteLength + blockedOffsetBuffer.byteLength + 1);
        returnBuffer.writeUInt8(this.getType(), offset++);
        streamIDBuffer.copy(returnBuffer, offset);
        offset += streamIDBuffer.byteLength;
        blockedOffsetBuffer.copy(returnBuffer, offset);
        return returnBuffer;
    }

    public getStreamId(): Bignum {
        return this.streamID;
    }

    public getBlockedOffset(): Bignum {
        return this.blockedOffset;
    }
}