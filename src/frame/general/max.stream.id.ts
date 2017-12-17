import { BaseFrame, FrameType } from "../base.frame";
import { Bignum } from "./../../utilities/bignum";


export class MaxStreamIdFrame extends BaseFrame {
    private maxStreamID: Bignum

	public constructor(maxStreamID: Bignum) {
        super(FrameType.MAX_STREAM_ID);
        this.maxStreamID = maxStreamID;
	}
    
    public toBuffer(): Buffer {
        throw new Error("Method not implemented.");
    }
}