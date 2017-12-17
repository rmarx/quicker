import {Bignum} from '../../utilities/bignum';
import {BaseFrame, FrameType} from '../base.frame';



export class StreamIdBlockedFrame extends BaseFrame {
    private streamID: Bignum;

	public constructor(streamID: Bignum) {
        super(FrameType.STREAM_ID_BLOCKED);
        this.streamID = streamID;
	}
}