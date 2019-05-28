import { Http3BaseFrame, Http3FrameType } from "./http3.baseframe";
import { Bignum } from "../../../../types/bignum";
import { VLIE, VLIEOffset } from "../../../../types/vlie";

export class Http3GoAwayFrame extends Http3BaseFrame {
    private streamID: Bignum;

    public constructor(streamID: Bignum) {
        super();
        this.streamID = streamID;
    }

    public toBuffer(): Buffer {
        const type: Buffer = VLIE.encode(this.getFrameType());
        const encodedLength: Buffer = VLIE.encode(this.getEncodedLength());
        const streamID: Buffer = VLIE.encode(this.streamID);

        return Buffer.concat([type, encodedLength, streamID]);
    }
    
    public static fromPayload(payload: Buffer, offset: number = 0): Http3GoAwayFrame {
        const streamID: VLIEOffset = VLIE.decode(payload, offset);
        return new Http3GoAwayFrame(streamID.value);
    }

    public getEncodedLength(): number {
        return VLIE.getEncodedByteLength(this.streamID);
    }

    public getFrameType(): Http3FrameType {
        return Http3FrameType.GOAWAY;
    }
    
    public getStreamID(): Bignum {
        return this.streamID;
    }
}
