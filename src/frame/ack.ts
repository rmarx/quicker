import { VLIE } from '../types/vlie';
import { Bignum } from '../types/bignum';
import { BaseFrame, FrameType } from './base.frame';
import { EncryptionLevel } from '../crypto/crypto.context';


/*
Since draft-15, there are 2 types of ACK frames: 0x1a and 0x1b, with the second one containing ECN counters
Instead of having a separate Frame class for the ECN ACKs, we keep everything in one class and always set the internal type to 0x1a
We use the containsECN boolean to indicate the frame was really/should really be of type 0x1b on the wire 
This makes some code much easier (checking if a packet is ACK-only for example), since the semantics of both types remain the same (e.g., for recovery)
*/
export class AckFrame extends BaseFrame {
    
    // mainly needed for easier statekeeping without having to pass this along everywhere we want to handle Crypto frames (e.g., send logic)
    // TODO: refactor flowcontrol further so this isn't needed? 
    private cryptoLevel?:EncryptionLevel; 

    private containsECN: boolean;

    private largestAcknowledged: Bignum;
    private ackDelay: Bignum;
    private ackBlockCount: Bignum;

    private firstAckBlock: Bignum;
    private ackBlocks: AckBlock[];

    private ECT0count:Bignum;
    private ECT1count:Bignum;
    private CEcount:Bignum;

    public constructor(containsECNinfo: boolean, largestAck: Bignum, ackDelay: Bignum, ackBlockCount: Bignum, firstAckBlock: Bignum, ackBlocks: AckBlock[]) {
        super(FrameType.ACK, false);
        this.containsECN = containsECNinfo;
        this.largestAcknowledged = largestAck;
        this.ackDelay = ackDelay;
        this.ackBlockCount = ackBlockCount;
        this.firstAckBlock = firstAckBlock;
        this.ackBlocks = ackBlocks;

        this.ECT0count = new Bignum(0);
        this.ECT1count = new Bignum(0);
        this.CEcount = new Bignum(0);
    }


    public setCryptoLevel(level:EncryptionLevel){
        this.cryptoLevel = level;
    }

    public getCryptoLevel(): EncryptionLevel|undefined {
        return this.cryptoLevel;
    }

    public getAckBlocks(): AckBlock[] {
        return this.ackBlocks;
    }

    public getLargestAcknowledged(): Bignum {
        return this.largestAcknowledged;
    }

    // !IMPORTANT: this is an encoded value, does not directly represent the amount of microseconds!
    // You need to use the ack_delay_exponent to calculate the real value, for example:
    // if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
    //    ackDelayExponent: number = connection.getRemoteTransportParameter(TransportParameterType.ACK_DELAY_EXPONENT);
    // } else {
    //    ackDelayExponent: number = Constants.DEFAULT_ACK_EXPONENT;
    // }
    // ackDelay = ackFrame.getAckDelay().toNumber() * (2 ** ackDelayExponent);
    // we don't do this transformation here to limit passing around the delayExponent
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
        var offset = 1;
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

        let ECT0countBuffer: Buffer = VLIE.encode( this.ECT0count );
        let ECT1countBuffer: Buffer = VLIE.encode( this.ECT1count );
        let CEcountBuffer: Buffer   = VLIE.encode( this.CEcount );

        var size = 1;
        size += VLIE.getEncodedByteLength(this.largestAcknowledged);
        size += VLIE.getEncodedByteLength(this.ackDelay);
        size += VLIE.getEncodedByteLength(this.ackBlockCount);
        size += VLIE.getEncodedByteLength(this.firstAckBlock);
        size += ackBlockByteSize;
        if( this.containsECN ){
            size += VLIE.getEncodedByteLength(this.ECT0count);
            size += VLIE.getEncodedByteLength(this.ECT1count);
            size += VLIE.getEncodedByteLength(this.CEcount);
        }

        var returnBuffer: Buffer = Buffer.alloc(size);
        if( this.containsECN )
            returnBuffer.writeUInt8(FrameType.ACK_ECN, 0);
        else
            returnBuffer.writeUInt8(FrameType.ACK, 0);

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

        if( this.containsECN ){
            ECT0countBuffer.copy( returnBuffer, offset );
            offset += ECT0countBuffer.byteLength;
            ECT1countBuffer.copy( returnBuffer, offset );
            offset += ECT1countBuffer.byteLength;
            CEcountBuffer.copy( returnBuffer, offset );
            offset += CEcountBuffer.byteLength;
        }

        return returnBuffer;
    }



    public determineAckedPacketNumbers(): Bignum[] {
        var packetnumbers: Bignum[] = [];

        var x = this.getLargestAcknowledged();
        packetnumbers.push(x);
        for (var i = 0; i < this.getFirstAckBlock().toNumber(); i++) {
            x = x.subtract(1);
            packetnumbers.push(x);
        }

        var ackBlock: AckBlock | undefined = this.getAckBlocks().shift();;
        while (ackBlock !== undefined) {
            for (var j = 0; j < ackBlock.getGap().toNumber(); j++) {
                x = x.subtract(1);
            }
            for (var j = 0; j < ackBlock.getBlock().toNumber(); j++) {
                x = x.subtract(1);
                packetnumbers.push(x);
            }
            ackBlock = this.getAckBlocks().shift();
        }
        return packetnumbers;
    }

    public containsECNinfo(){ return this.containsECN; }

    public setECT0count(count:Bignum){  return this.ECT0count = count; }
    public setECT1count(count:Bignum){  return this.ECT1count = count; }
    public setCEcount(count:Bignum){    return this.CEcount   = count; }

    public getECT0count(){  return this.ECT0count;  }
    public getECT1count(){  return this.ECT1count;  }
    public getCEcount(){    return this.CEcount;    }
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