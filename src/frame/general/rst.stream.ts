import { BaseFrame, FrameType } from "../base.frame";
import { Bignum } from "./../../utilities/bignum";



export class RstStreamFrame extends BaseFrame {
    private streamID: Bignum;
    private applicationErrorCode: number
    private finalOffset: Bignum;

    public constructor(streamID: Bignum, applicationErrorCode: number, finalOffset: Bignum) {
        super(FrameType.RST_STREAM);
        this.streamID = streamID;
        this.applicationErrorCode = applicationErrorCode;
        this.finalOffset = finalOffset;
    }

    public toBuffer(): Buffer {
        throw new Error("Method not implemented.");
    }
}