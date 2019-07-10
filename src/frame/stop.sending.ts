import {BaseFrame, FrameType} from './base.frame';
import {Bignum} from '../types/bignum';
import {VLIE} from '../types/vlie';



export class StopSendingFrame extends BaseFrame {
    private streamID: Bignum;
    private applicationErrorCode: number;

    constructor(streamID: Bignum, applicationErrorCode: number) {
        super(FrameType.STOP_SENDING, true);
        this.streamID = streamID;
        this.applicationErrorCode = applicationErrorCode;
    }

    public toBuffer(): Buffer {
        var eStreamId: Buffer = VLIE.encode(this.streamID);
        // 8 bit type + 16 bit applicationErrorCode
        var bufLength: number = 3 + eStreamId.byteLength;
        var buffer = Buffer.alloc(bufLength);
        var offset = 0;
        buffer.writeUInt8(this.getType(), offset++);
        eStreamId.copy(buffer, offset);
        offset += eStreamId.byteLength;
        buffer.writeUInt16BE(this.applicationErrorCode, offset);
        return buffer;
    }

    public getStreamId(): Bignum {
        return this.streamID;
    }

    public getApplicationErrorCode(): number {
        return this.applicationErrorCode;
    }
}