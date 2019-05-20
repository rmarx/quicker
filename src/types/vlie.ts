import { Bignum } from "./bignum";
import { Buffer } from "buffer";

/**
 * Variable Length Integer Encoding
 */
export class VLIE {

    public static getEncodedByteLength(bignum: Bignum) {
        return 2 ** this.getBytesNeeded(bignum);
    }

    static encode(bignum: Bignum): Buffer;
    static encode(num: number): Buffer;
    public static encode(number: any): Buffer {
        if (number instanceof Bignum) {
            return VLIE.encodeBignum(number);
        }
        return VLIE.encodeNumber(number);
    }

    /*
    static encodePn(bignum: Bignum): Buffer;
    static encodePn(num: number): Buffer;
    public static encodePn(number: any): Buffer {
        if (number instanceof Bignum) {
            return VLIE.encodePnBignum(number);
        }
        return VLIE.encodePnNumber(number);
    }
    */
    

    /**
     * Decodes buffer into a BigNum instance and an offset.
     * For ease of use, the offset is NOT just the offset needed for the VLIE encoded value, but initialOffset + VLIEoffset
     * Calling code can then just to  currentOffset = VLIE.decode, instead of currentOffset += VLIE.decode 
     * @param buf 
     * @param offset 
     */
    public static decode(buf: Buffer, offset: number = 0): VLIEOffset {
        return VLIE.decodeBuffer(buf, offset);
    }

    public static decodeString(str: string): Bignum {
        return this.decodeBuffer(Buffer.from(str, 'hex'), 0).value;
    }

    /*
    public static decodePn(buffer: Buffer, offset: number = 0): VLIEOffset {

        // pnSize is encoded in the first 1-2 bits
        // 0x00... : pn is 1 byte, 7 bits left to read
        // 0x10... : pn is 2 bytes, 14 bits left to read
        // 0x11... : pn is 4 bytes, 30 bits left to read

        // 0x80 = 0x1000 0000 : check for the first bit to be set
        // 0x40 = 0x0100 0000 : checks for the second bit to be set

        var pnSize = 1; // in bytes
        var msb = buffer.readUInt8(offset);
        offset = ++offset;
        if(msb & 0x80) {
            pnSize++;
            msb -= 0x80;
            if (msb & 0x40) {
                pnSize += 2;
                msb -= 0x40;
            }
        }
        var bn = new Bignum(msb);
        for(var i = 1; i < pnSize; i++) {
            bn = bn.shiftLeft(8);
            bn = bn.add(buffer.readUInt8(offset++));
        }
        return {
            value: bn,
            offset: offset
        };
    }
    */

    private static encodeBignum(bignum: Bignum): Buffer {
        var count = this.getBytesNeeded(bignum);
        var bn = new Bignum(count);
        for(var i = 0; i < (2**count - 1); i++) {
            bn = bn.shiftLeft(8);
        }
        bn = bn.shiftLeft(6);
        bn = bn.add(bignum);
        return bn.toBuffer(2**count);
    }

    private static encodeNumber(num: number): Buffer {
        return this.encodeBignum(new Bignum(num));
    }

    private static decodeBuffer(buffer: Buffer, offset: number): VLIEOffset {
        var msb = buffer.readUInt8(offset++);
        var count = 0;
        if(msb & 0x40) {
            count += 1;
            msb -= 0x40;
        }
        if(msb & 0x80) {
            count += 2;
            msb -= 0x80;
        }
        var bn = new Bignum(msb);
        for(var i = 1; i < 2**count; i++) {
            bn = bn.shiftLeft(8);
            bn = bn.add(buffer.readUInt8(offset++));
        }
        return {
            value: bn,
            offset: offset
        };
    }

    /*
    private static encodePnBignum(bignum: Bignum): Buffer {
        var count = this.getBytesNeededPn(bignum);
        if (count === 0) {
            var bn = new Bignum(count);
        } else {
            var bn = new Bignum(count + 1);
        }
        for(var i = 1; i < (2**count); i++) {
            bn = bn.shiftLeft(8);
        }
        if (count === 0) {
            bn = bn.shiftLeft(7);
        } else {
            bn = bn.shiftLeft(6);
        }
        bn = bn.add(bignum);
        return bn.toBuffer(2**count);
    }

    private static encodePnNumber(num: number): Buffer {
        return this.encodePnBignum(new Bignum(num));
    }
    */

    private static getBytesNeeded(bignum: Bignum): number {
        if(bignum.getBitLength() <= 6) {
            return 0;
        }
        if (bignum.getBitLength() <= 14) {
            return 1;
        }
        if (bignum.getBitLength() <= 30) {
            return 2;
        }
        return 3;
    }

    /*
    public static getBytesNeededPn(bignum: Bignum): number {
        // getBytesNeeded would return 2 when size is bit
        // However, for PNE, only 1 bit is needed to indicate that the size is 1 byte
        if(bignum.getBitLength() <= 7) {
            return 0;
        }
        return this.getBytesNeeded(bignum);
    }
    */
}

export interface VLIEOffset {
    value: Bignum, 
    offset: number
}