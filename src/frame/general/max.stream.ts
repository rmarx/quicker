import {Bignum} from '../../utilities/bignum';
import {BaseFrame, FrameType} from '../base.frame';



export class MaxStreamFrame extends BaseFrame {
    private streamID: Bignum;
    private maxData: Bignum;

	public constructor(streamID: Bignum, maxData: Bignum) {
        super(FrameType.MAX_STREAM_DATA);
        this.streamID = streamID;
		this.maxData = maxData;
    }
    
    public toBuffer(): Buffer {
        throw new Error("Method not implemented.");
    }
}