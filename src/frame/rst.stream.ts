import {Bignum} from '../types/bignum';
import {VLIE} from '../types/vlie';
import {BaseFrame, FrameType} from './base.frame';



export class RstStreamFrame extends BaseFrame {
    private streamID: Bignum;
    private applicationErrorCode: number
    private finalOffset: Bignum;

    public constructor(streamID: Bignum, applicationErrorCode: number, finalOffset: Bignum) {
        super(FrameType.RESET_STREAM, true);
        this.streamID = streamID;
        this.applicationErrorCode = applicationErrorCode;
        this.finalOffset = finalOffset;
    }

    public toBuffer(): Buffer {
        var eStreamId: Buffer = VLIE.encode(this.streamID);
        var eFinalOffset: Buffer = VLIE.encode(this.finalOffset);
        // 8 bit type + 16 bit applicationErrorCode
        var bufLength: number = 3 + eStreamId.byteLength + eFinalOffset.byteLength;
        var buffer = Buffer.alloc(bufLength);
        var offset = 0;
        buffer.writeUInt8(this.getType(), offset++);
        eStreamId.copy(buffer, offset);
        offset += eStreamId.byteLength;
        buffer.writeUInt16BE(this.applicationErrorCode, offset);
        offset += 2;
        eFinalOffset.copy(buffer, offset);
        return buffer;
    }

    public getStreamId(): Bignum {
        return this.streamID;
    }

    public getApplicationErrorCode(): number {
        return this.applicationErrorCode;
    }

    public getFinalOffset(): Bignum {
        return this.finalOffset;
    }
}