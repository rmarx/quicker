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
        const type: Buffer = VLIE.encode(this.getFrameType());
        const encodedLength: Buffer = VLIE.encode(this.getEncodedLength());
        const maxPushID: Buffer = VLIE.encode(this.maxPushID);

        return Buffer.concat([type, encodedLength, maxPushID]);
    }

    public getEncodedLength(): number {
        return VLIE.getEncodedByteLength(this.maxPushID);
    }

    public getFrameType(): Http3FrameType {
        return Http3FrameType.MAX_PUSH_ID;
    }
}
