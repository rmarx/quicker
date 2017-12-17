import { BaseFrame, FrameType } from "../base.frame";
import { Bignum } from "./../..//utilities/bignum";



export class StreamBlockedFrame extends BaseFrame {
    private streamID: Bignum;
    private blockedOffset: Bignum;

	public constructor(streamID: Bignum, blockedOffset: Bignum) {
        super(FrameType.STREAM_BLOCKED);
        this.streamID = streamID;
        this.blockedOffset = blockedOffset;
	}
}