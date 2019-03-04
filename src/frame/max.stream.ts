import {BaseFrame, FrameType} from './base.frame';
import {Bignum} from '../types/bignum';
import {VLIE} from '../types/vlie';


export class MaxStreamFrame extends BaseFrame {
    private streamID: Bignum;
    private maxData: Bignum;

	public constructor(streamID: Bignum, maxData: Bignum) {
        super(FrameType.MAX_STREAM_DATA, true);
        this.streamID = streamID;
		this.maxData = maxData;
    }
    
    public toBuffer(): Buffer {
        var offset = 0;
        var streamIDBuffer: Buffer = VLIE.encode(this.streamID);
        var maxDataBuffer: Buffer = VLIE.encode(this.maxData);
        var returnBuffer: Buffer = Buffer.alloc(streamIDBuffer.byteLength + maxDataBuffer.byteLength + 1);
        returnBuffer.writeUInt8(this.getType(), offset++);
        streamIDBuffer.copy(returnBuffer, offset);
        offset += streamIDBuffer.byteLength;
        maxDataBuffer.copy(returnBuffer, offset);
        return returnBuffer;
    }

    public getMaxData(): Bignum {
        return this.maxData;
    }

    public getStreamId(): Bignum {
        return this.streamID;
    }
}