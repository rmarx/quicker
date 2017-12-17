import {Bignum} from '../../utilities/bignum';
import {BaseFrame, FrameType} from '../base.frame';



export class BlockedFrame extends BaseFrame {
    private blockedOffset: Bignum;

	public constructor(blockedOffset: Bignum) {
        super(FrameType.BLOCKED);
        this.blockedOffset = blockedOffset;
    }
    
    public toBuffer(): Buffer {
        throw new Error("Method not implemented.");
    }
}