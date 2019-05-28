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
        const type: Buffer = VLIE.encode(this.getFrameType());
        const encodedLength: Buffer = VLIE.encode(this.getEncodedLength());

        let buffer: Buffer = Buffer.alloc(type.byteLength + encodedLength.byteLength + this.payload.byteLength);

        // Copy contents to buffer
        type.copy(buffer);
        encodedLength.copy(buffer, type.byteLength);
        this.payload.copy(buffer, type.byteLength + encodedLength.byteLength);

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
