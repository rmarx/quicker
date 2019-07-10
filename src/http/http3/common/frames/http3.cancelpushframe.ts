import { Http3BaseFrame, Http3FrameType } from "./http3.baseframe";
import { Bignum } from "../../../../types/bignum";
import { VLIE } from "../../../../types/vlie";

export class Http3CancelPushFrame extends Http3BaseFrame {
    private pushID: Bignum;

    public constructor(payload: Buffer) {
        super();
        this.pushID = VLIE.decode(payload).value;
    }

    public toBuffer(): Buffer {
        const type: Buffer = VLIE.encode(this.getFrameType());
        const encodedLength: Buffer = VLIE.encode(this.getEncodedLength());
        const payload: Buffer = VLIE.encode(this.pushID);

        return Buffer.concat([type, encodedLength, payload]);
    }

    public getEncodedLength(): number {
        return VLIE.getEncodedByteLength(this.pushID);
    }

    public getFrameType(): Http3FrameType {
        return Http3FrameType.CANCEL_PUSH;
    }

    public getPushID(): Bignum {
        return this.pushID;
    }
}
