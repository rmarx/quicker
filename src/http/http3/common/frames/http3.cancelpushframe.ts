import { Http3BaseFrame, Http3FrameType } from "../http3.baseframe";
import { Bignum } from "../../../../types/bignum";
import { VLIE } from "../../../../types/vlie";

export class Http3CancelPushFrame extends Http3BaseFrame {
    private pushID: Bignum;

    public constructor(payload: Buffer) {
        super();
        this.pushID = VLIE.decode(payload).value;
    }

    public toBuffer(): Buffer {
        let encodedLength: Buffer = VLIE.encode(this.getPayloadLength());
        let buffer: Buffer = Buffer.alloc(encodedLength.byteLength + 1 + VLIE.getEncodedByteLength(this.pushID));

        encodedLength.copy(buffer);
        buffer.writeUInt8(this.getFrameType(), encodedLength.byteLength);
        let pushID = VLIE.encode(this.pushID);
        pushID.copy(buffer, encodedLength.byteLength + 1);

        return buffer;
    }

    public getPayloadLength(): Bignum {
        return new Bignum(VLIE.getEncodedByteLength(this.pushID));
    }

    public getFrameType(): Http3FrameType {
        return Http3FrameType.CANCEL_PUSH;
    }
}
