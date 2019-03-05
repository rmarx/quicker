import { Http3BaseFrame, Http3FrameType } from "../http3.baseframe";
import { Bignum } from "../../../../types/bignum";
import { VLIE } from "../../../../types/vlie";

/* TODO: QPACK! */

export class Http3HeaderFrame extends Http3BaseFrame {
    private payload: Buffer;

    public constructor(payload: Buffer) {
        super();
        this.payload = payload;
    }

    public toBuffer(): Buffer {
        let encodedLength: Buffer = VLIE.encode(this.getPayloadLength());
        let buffer: Buffer = Buffer.alloc(encodedLength.byteLength + 1 + this.payload.byteLength);

        encodedLength.copy(buffer);
        buffer.writeUInt8(this.getFrameType(), encodedLength.byteLength);
        this.payload.copy(buffer, encodedLength.byteLength + 1);

        return buffer;
    }

    public getPayloadLength(): number {
        return this.payload.byteLength;
    }

    public getFrameType(): Http3FrameType {
        return Http3FrameType.HEADERS;
    }
}
