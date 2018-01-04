import {VLIE} from '../../crypto/vlie';
import {Bignum} from '../../types/bignum';
import {BaseFrame, FrameType} from '../base.frame';



export class AckFrame extends BaseFrame {

    private largestAcknowledged: Bignum;
    private ackDelay: Bignum;
    private ackBlockCount: Bignum;
    
    private firstAckBlock: Bignum;
    private ackBlocks: AckBlock[];

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

    public toBuffer(): Buffer {
        var offset = 0;
        var laBuffer: Buffer = VLIE.encode(this.largestAcknowledged);
        var ackDelayBuffer: Buffer = VLIE.encode(this.ackDelay);
        var ackBlockCount: Buffer = VLIE.encode(this.ackBlockCount);
        var firstAckBlockBuffer: Buffer = VLIE.encode(this.firstAckBlock);
        var ackBlockBuffers: Buffer[] = [];
        var ackBlockByteSize = 0;
        this.ackBlocks.forEach((ackBlock: AckBlock) => {
            var ackBlockBuffer: Buffer = ackBlock.toBuffer();
            ackBlockByteSize += ackBlockBuffer.byteLength;
            ackBlockBuffers.push(ackBlockBuffer);
        });

        var size = 0;
        size += VLIE.getEncodedByteLength(this.largestAcknowledged);
        size += VLIE.getEncodedByteLength(this.ackDelay);
        size += VLIE.getEncodedByteLength(this.ackBlockCount);
        size += VLIE.getEncodedByteLength(this.firstAckBlock);
        size += ackBlockByteSize;
    
        var returnBuffer: Buffer = Buffer.alloc(size);
        laBuffer.copy(returnBuffer, offset);
        offset += laBuffer.byteLength;
        ackDelayBuffer.copy(returnBuffer, offset);
        offset += ackDelayBuffer.byteLength;
        ackBlockCount.copy(returnBuffer, offset);
        offset += ackBlockCount.byteLength;
        firstAckBlockBuffer.copy(returnBuffer, offset);
        offset += firstAckBlockBuffer.byteLength;
        ackBlockBuffers.forEach((ackBlockBuffer: Buffer) => {
            ackBlockBuffer.copy(returnBuffer, offset);
            offset += ackBlockBuffer.byteLength;
        });

        return returnBuffer;
    }
}

export class AckBlock {
    private gap: Bignum;
    private block: Bignum;

    public constructor(gap: Bignum, block: Bignum) {
        this.gap = gap;
        this.block = block;
    }

    public getGap(): Bignum {
        return this.gap;
    }

    public getBlock(): Bignum {
        return this.block;
    }

    public toBuffer(): Buffer {
        var offset = 0;
        var gapBuffer: Buffer = VLIE.encode(this.gap);
        var blockBuffer: Buffer = VLIE.encode(this.block);
        var returnBuffer: Buffer = Buffer.alloc(gapBuffer.byteLength + blockBuffer.byteLength);
        gapBuffer.copy(returnBuffer, offset);
        offset += VLIE.getEncodedByteLength(this.gap);
        blockBuffer.copy(returnBuffer, offset);
        return returnBuffer;
    }
}