import { Bignum } from '../../types/bignum';
import { QuicError } from '../../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../../utilities/errors/quic.codes';
import { VerboseLogging } from '../../utilities/logging/verbose.logging';


export class BaseProperty {

    private property: Bignum;

    public constructor(bn: Bignum);
    public constructor(number: number, byteSize?: number);
    public constructor(buffer: Buffer, byteSize?: number);
    public constructor(obj: any, byteSize: number = 4) {
        if (obj instanceof Bignum) {
            this.property = obj;
        } else {
            this.property = new Bignum(obj, byteSize);
        }
    }

    protected getProperty(): Bignum {
        return this.property;
    }

    protected setProperty(bignum: Bignum) {
        this.property = bignum;
    }

    public toBuffer(): Buffer {
        return this.property.toBuffer();
    }

    public toString(): string {
        return this.property.toString("hex");
    }
}

export class ConnectionID extends BaseProperty {

    private length: number;

    public constructor(buffer: Buffer, byteLength: number) {
        super(buffer, byteLength);
        this.length = byteLength;
    }

    // Only use the underlying Bignum directly for comparison purposes
    // see ConnectionID.toBuffer for the explanation why
    public getValueForComparison(): Bignum {
        return this.getProperty();
    }

    public getByteLength(): number {
        return this.length;
    }

    public toBuffer(): Buffer {
        // Bignum can't really deal with 0-length buffers
        // if you pass Buffer.alloc(0) to our ConnectionID constructor, the underlying Bignum makes it into a 1-byte buffer filled with 0 (uint8)
        // Since we really want to support 0-length connectionIDs, we need to catch that here and return a 0-length buffer here without relying on the underlying Bignum
        if( this.getByteLength() === 0 )
            return Buffer.alloc(0);
        else
            return this.getProperty().toBuffer();
    }

    // REFACTOR TODO: override the toBuffer() method and only include the connectionID length in there, instead of in the randomConnectionID function, see below
    // in the current setup, if you create a new ConnectionID yourself, the serialization into Short header won't be correct!!! 
    // although, take care here: that is actually what you want if you use this to just hold the other party's connectionID, which might use a different logic!!!
    // -> so check the logic when SENDING packets and how we fill the ConnectionID there before manhandling this  

    public static randomConnectionID(): ConnectionID {
        var len = Math.ceil(Math.random() * 14) + 3; // in octects (bytes), has to be between 4 and 18
        var highHex = "";
        for (var i = 0; i < len; i++) {
            highHex += "ff";
        }
        var randomBignum = Bignum.random(highHex, len);
        var randomBuffer = randomBignum.toBuffer();
        var length = randomBuffer.byteLength + 1;
        var buf = Buffer.alloc(length);
        buf.writeUInt8(length, 0);
        randomBuffer.copy(buf, 1);
        return new ConnectionID(buf, length);
    }
}

export class PacketNumber extends BaseProperty {

    public constructor(bn: Bignum);
    //public constructor(number: number);
    public constructor(buffer: Buffer);
    public constructor(buffer: any) { 
        if( buffer instanceof Bignum ) // super() only enforces bytelength 8 if it's NOT a bignum... go figure
            super( buffer );
        else if( buffer instanceof Buffer )
            super(buffer, (buffer as Buffer).byteLength);
    }

    public getValue(): Bignum {
        return this.getProperty();
    }

    public setValue(bignum: Bignum) {
        bignum.setByteLength(8);
        this.setProperty(bignum);
    }

    public restoreFromTruncate( largestAcknowledgedPacketNumber: PacketNumber ): PacketNumber {
        // "this" is the truncated packet number
        // e.g., header.truncatedPacketNumber.restoreFromTruncate()

        /*
        We literally implement the example pseudocode from Transport document, Appendix A:
            DecodePacketNumber(largest_pn, truncated_pn, pn_nbits):
                expected_pn  = largest_pn + 1
                pn_win       = 1 << pn_nbits
                pn_hwin      = pn_win / 2
                pn_mask      = pn_win - 1

                candidate_pn = (expected_pn & ~pn_mask) | truncated_pn
                if candidate_pn <= expected_pn - pn_hwin:
                    return candidate_pn + pn_win
                if candidate_pn > expected_pn + pn_hwin and candidate_pn > pn_win:
                    return candidate_pn - pn_win
                return candidate_pn
            }
        */

        /*
            I find packet number encoding quite difficult to understand...
            How I see it:
            - want to only send the minimal amount of bits on the wire
            - so we want to take as few of the least significant bytes as possible (ideally 1, out of a max of 4)
            - to be able to reconstruct on the other side, we need to do some_known_value + least_significant_bytes
            - we use the largestAcknowledgedPacketNumber for this: as long as we do not have a huge amount of outstanding PNs out there (max of 65k with 4 bytes PN length)
                 we can reconstruct
            - it's not as simple as just cutting off a fixed prefix though, it's more complicated
            - even crossing byte-length boundaries (e.g., encoding a 2-byte value in 1 byte even if largestAcked is also a 1-byte value) works somehow
            
            - We somehow calculate a window around the packet number of size roughly (currentPN - largestAckedPN) * 2
                this is done in :truncate()
            - Somehow, by making sure we take bytes enough to fill that window, we can always correctly reconstruct the PN based on the logic below
        */

        let expectedPN  = largestAcknowledgedPacketNumber.getValue().add(1);

        let PNwin = new Bignum(1);
        PNwin         = PNwin.shiftLeft( this.getValue().getByteLength() * 8 );
        let PNwinHalf = PNwin.divide(2);
        let PNmask    = PNwin.subtract(1);

        // notn expects a bit width to be passed along
        // since we have at max a uint64, 64 bits is enough 
        // e.g., if the mask is 1111 1111, notn(64) generates 11111111 11111111 11111111 11111111 11111111 11111111 11111111 00000000 
        let candidatePN = expectedPN.and(PNmask.notn(64)).or(this.getValue()); 

        if( candidatePN.lessThanOrEqual(expectedPN.subtract(PNwinHalf)) ){
            return  new PacketNumber(candidatePN.add(PNwin));
        }

        if( candidatePN.greaterThan(expectedPN.add(PNwinHalf)) && candidatePN.greaterThan(PNwin) ){
            return  new PacketNumber(candidatePN.subtract(PNwin));
        }

        return new PacketNumber(candidatePN);
    }

    public truncate( largestAcknowledgedPacketNumber: PacketNumber ):PacketNumber {
        // this is the full packet number
        // e.g., packetNumber.truncate( largestAcked )

        // Other implementations:
        // QUINN: https://github.com/djc/quinn/blob/draft-20/quinn-proto/src/packet.rs#L601
        // quic-tracker: https://github.com/QUIC-Tracker/quic-tracker/blob/728f1a083c1f80000a63bde9026ed6a9c7bfd539/common.go#L73
        // https://tools.ietf.org/html/draft-ietf-quic-transport-20#section-17.1
        /*
            The sender MUST use a packet number size able to represent more than
            twice as large a range than the difference between the largest
            acknowledged packet and packet number being sent.  A peer receiving
            the packet will then correctly decode the packet number, unless the
            packet is delayed in transit such that it arrives after many higher-
            numbered packets have been received.  An endpoint SHOULD use a large
            enough packet number encoding to allow the packet number to be
            recovered even if the packet arrives after packets that are sent
            afterwards.

            As a result, the size of the packet number encoding is at least one
            bit more than the base-2 logarithm of the number of contiguous
            unacknowledged packet numbers, including the new packet.
            (base-2 logarithm: how many bits you need to encode that value)
        */
        
        if( this.getValue().lessThan(largestAcknowledgedPacketNumber.getValue()) ){
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "Cannot truncate to a higher packet number! " + this.getValue() + " <= " + largestAcknowledgedPacketNumber.getValue());
        } 

        // for an explanation of the algorithm, look at :restoreFromTruncate
        // this approach was inspired by the Quinn implementation
        let diffRange = this.getValue().subtract( largestAcknowledgedPacketNumber.getValue() );
        let diffRange2 = diffRange.multiply(2);

        // need to extract the 1,2,3 or 4 least significant bytes from our PN
        // we use 4 masks plus the and() operator for this
        // e.g.,  1111 0000 1111 1010 & 0xFF becomes : 1111 1010

        // Bignum's and() has the tendency to lower the bytelength if we have leading zeroes
        // however, the leading zeroes HAVE to be present if within the expected byteLength
        // so we have to force this with setByteLength...
        if( diffRange2.lessThan(256) ){ // range fits in 1 byte
            let pn = new PacketNumber( this.getValue().and( 0xFF ) );
            pn.getValue().setByteLength(1);
            return pn;
        }
        else if( diffRange2.lessThan(65536) ){ // range fits in 2 bytes
            let pn = new PacketNumber( this.getValue().and( 0xFFFF ) );
            pn.getValue().setByteLength(2);
            return pn;
        } 
        else if( diffRange2.lessThan(16777216) ){ // range fits in 3 bytes
            let pn = new PacketNumber( this.getValue().and( 0xFFFFFF ) );
            pn.getValue().setByteLength(3);
            return pn;
        }
        else if( diffRange2.lessThan( new Bignum(Buffer.from([0xFF, 0xFF, 0xFF, 0xFF])) ) ){ // range fits in 4 bytes (JS doesn't go all the way up to 32 bit uints, so use bignum)
            // TODO: do not create a new buffer here every time! 
            let pn = new PacketNumber( this.getValue().and( new Bignum(Buffer.from([0xFF, 0xFF, 0xFF, 0xFF])) ) );    
            pn.getValue().setByteLength(4);
            return pn;
        }  
        else{ 
            VerboseLogging.error("PacketNumber:truncate : value was too large to fit in 4 bytes! " + diffRange2.toString() );
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "Packet number range was too large to fit in 4 bytes " + diffRange2.toString());
        }
    }

    /*
    public getMostSignificantBytes(size: number = 4): Buffer {
        size = size > 8 ? 8 : size;
        var buf = Buffer.alloc(size);
        this.getProperty().toBuffer(8).copy(buf, 0, 0, size);
        return buf;
    }

    public getLeastSignificantBytes(size: number = 4): Buffer {
        size = size > 8 ? 8 : size;
        var buf = Buffer.alloc(size);
        this.getProperty().toBuffer(8).copy(buf, 0, 8 - size, 8);
        return buf;
    }
    */

    /*
    // due to packet number encoding (helps save some bits), we have to use previously received packet number values to reconstruct the real packet number at the edge cases
    // see draft-13#4.8 and Appendix A "Sample Packet Number Decoding Algorithm"
    public adjustNumber(packetNumber: PacketNumber, size: number) {
        var mask = new Bignum(1);
        for (var i = 0; i < 63; i++) {
            mask = mask.shiftLeft(1);
            if (63 - i > (size * 8)) {
                mask = mask.add(1);
            }
        }
        var maskedResult = this.getValue().and(mask);
        var next = packetNumber.getValue().mask(size);
        next = next.add(maskedResult);
        return next;
    }
    */
}


export class Version extends BaseProperty {

    public constructor(buffer: Buffer) {
        super(buffer);
    }

    public getValue(): Bignum {
        return this.getProperty();
    }

    public setValue(bignum: Bignum) {
        this.setProperty(bignum);
    }

    public equals(version:Version) {
        return version !== undefined && version.getValue() != undefined && version.getValue().equals( this.getProperty() );
    }
}