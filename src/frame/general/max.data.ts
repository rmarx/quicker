import { BaseFrame, FrameType } from "../base.frame";
import { Bignum } from "./../../utilities/bignum";



export class MaxDataFrame extends BaseFrame {
    private maxData: Bignum;

    public constructor(maxData: Bignum) {
        super(FrameType.MAX_DATA);
        this.maxData = maxData;
    }

    public toBuffer(): Buffer {
        throw new Error("Method not implemented.");
    }
}