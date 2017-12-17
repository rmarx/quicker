import { Bignum } from '../../utilities/bignum';
import { BaseFrame, FrameType } from '../base.frame';



export class StopSendingFrame extends BaseFrame {
    private streamID: Bignum;
    private applicationErrorCode: number;

    constructor(streamID: Bignum, applicationErrorCode: number) {
        super(FrameType.STOP_SENDING);
        this.streamID = streamID;
        this.applicationErrorCode = applicationErrorCode;
    }

    public toBuffer(): Buffer {
        throw new Error("Method not implemented.");
    }
}