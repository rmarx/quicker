import {Bignum} from '../../utilities/bignum';
import {BaseFrame, FrameType} from '../base.frame';



export class AckFrame extends BaseFrame {

    private largestAcknowledged: Bignum;
    private ackDelay: Bignum;
    private ackBlockCount: Bignum;
    
    private firstAckBlock: Bignum;
    private ackBlocks: AckBlock[];

    public toBuffer(): Buffer {
        throw new Error("Method not implemented.");
    }

    public constructor(largestAck: Bignum, ackDelay: Bignum, ackBlockCount: Bignum, firstAckBlock: Bignum, ackBlocks: AckBlock[]) {
        super(FrameType.ACK);
        this.largestAcknowledged = largestAck;
        this.ackDelay = ackDelay;
        this.ackBlockCount = ackBlockCount;
        this.firstAckBlock = firstAckBlock;
        this.ackBlocks = ackBlocks;
    }

    public getAckBlocks(): AckBlock[] {
        return this.ackBlocks;
    }

    public getLargestAcknowledged(): Bignum {
        return this.largestAcknowledged;
    }

    public getAckDelay(): Bignum {
        return this.ackDelay;
    }

    public getAckBlockCount() {
        return this.ackBlockCount;
    }

    public getFirstAckBlock(): Bignum {
        return this.firstAckBlock;
    }
}

export class AckBlock {
    private gap: Bignum;
    private block: Bignum;

    public constructor(gap: Bignum, block: Bignum) {
        this.gap = gap;
        this.block = block;
    }

    private getGap(): Bignum {
        return this.gap;
    }

    private getBlock(): Bignum {
        return this.block;
    }
}