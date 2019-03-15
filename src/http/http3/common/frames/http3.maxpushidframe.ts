import { Http3BaseFrame, Http3FrameType } from "./http3.baseframe";
import { Bignum } from "../../../../types/bignum";
import { VLIE } from "../../../../types/vlie";

export class Http3MaxPushIDFrame extends Http3BaseFrame {
    private maxPushID: Bignum;

    public constructor(payload: Buffer) {
        super();
        this.maxPushID = VLIE.decode(payload).value;
    }

    public toBuffer(): Buffer {
        let encodedLength: Buffer = VLIE.encode(this.getPayloadLength());
        let buffer: Buffer = Buffer.alloc(encodedLength.byteLength + 1 + VLIE.getEncodedByteLength(this.maxPushID));

        encodedLength.copy(buffer);
        buffer.writeUInt8(this.getFrameType(), encodedLength.byteLength);
        const maxPushID = VLIE.encode(this.maxPushID);
        maxPushID.copy(buffer, encodedLength.byteLength + 1);

        return buffer;
    }

    public getPayloadLength(): number {
        return VLIE.getEncodedByteLength(this.maxPushID);
    }

    public getFrameType(): Http3FrameType {
        return Http3FrameType.MAX_PUSH_ID;
    }
}
