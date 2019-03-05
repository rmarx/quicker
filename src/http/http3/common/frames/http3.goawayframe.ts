import { Http3BaseFrame, Http3FrameType } from "../http3.baseframe";
import { Bignum } from "../../../../types/bignum";
import { VLIE } from "../../../../types/vlie";

export class Http3GoAwayFrame extends Http3BaseFrame {
    private streamID: Bignum;

    public constructor(payload: Buffer) {
        super();
        this.streamID = VLIE.decode(payload).value;
    }

    public toBuffer(): Buffer {
        let encodedLength: Buffer = VLIE.encode(this.getPayloadLength());
        let buffer: Buffer = Buffer.alloc(encodedLength.byteLength + 1 + VLIE.getEncodedByteLength(this.streamID));

        encodedLength.copy(buffer);
        buffer.writeUInt8(this.getFrameType(), encodedLength.byteLength);
        const streamID = VLIE.encode(this.streamID);
        streamID.copy(buffer, encodedLength.byteLength + 1);

        return buffer;
    }

    public getPayloadLength(): number {
        return VLIE.getEncodedByteLength(this.streamID);
    }

    public getFrameType(): Http3FrameType {
        return Http3FrameType.GOAWAY;
    }
}
