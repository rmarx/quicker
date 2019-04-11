import { Http3BaseFrame, Http3FrameType } from "./http3.baseframe";
import { Bignum } from "../../../../types/bignum";
import { VLIE } from "../../../../types/vlie";

export class Http3DataFrame extends Http3BaseFrame {
    private payload: Buffer;

    public constructor(payload: Buffer) {
        super();
        this.payload = payload;
    }

    public toBuffer(): Buffer {
        let encodedLength: Buffer = VLIE.encode(this.getEncodedLength());
        let buffer: Buffer = Buffer.alloc(encodedLength.byteLength + 1 + this.payload.byteLength);

        encodedLength.copy(buffer);
        buffer.writeUInt8(this.getFrameType(), encodedLength.byteLength);
        this.payload.copy(buffer, encodedLength.byteLength + 1);

        return buffer;
    }
    
    public static fromPayload(payload: Buffer): Http3DataFrame {
        return new Http3DataFrame(payload);
    }
    
    public getPayload(): Buffer {
        return this.payload;
    }

    public getEncodedLength(): number {
        return this.payload.byteLength;
    }

    public getFrameType(): Http3FrameType {
        return Http3FrameType.DATA;
    }
}
