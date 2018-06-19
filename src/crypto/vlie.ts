import { Bignum } from "../types/bignum";
import { Buffer } from "buffer";

/**
 * Variable Length Integer Encoding
 * see https://tools.ietf.org/html/draft-ietf-quic-transport#section-7.1
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

    private static encodeBignum(bignum: Bignum): Buffer {
        var exponent = this.getBytesNeeded(bignum);
        var bn = new Bignum(exponent); // first 2 bits of the MSB indicate the size of the VLIE encoded integer, acts as exponent to 2
        for(var i = 0; i < (2**exponent - 1); i++) {
            bn = bn.shiftLeft(8); // encoded in BIG ENDIAN, so MSB on the left
        }
        bn = bn.shiftLeft(6);
        bn = bn.add(bignum);
        return bn.toBuffer(2**exponent);
    }

    private static decodeBuffer(buffer: Buffer, offset: number): VLIEOffset {
        // integer is in big endian, so MSB is to the left, so the first UInt8 of the buffer 
        var msb = buffer.readUInt8(offset++);

        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-7.1
        // 0b00 = 1 byte long
        // 0b01 = 2 bytes long
        // 0b10 = 4 bytes long
        // 0b11 = 8 bytes long
        var exponent = 0;
        if(msb & 0x40) { // 0x40 = 0b0100 0000 
            exponent += 1; // 2 bytes, so 2^1
            msb -= 0x40;
        }
        if(msb & 0x80) { // 0x80 = 0b1000 0000
            exponent += 2; // 4 bytes so 2^2, OR 8 bytes so 2^3
            msb -= 0x80;
        }
        // REFACTOR TODO: can't we just immediately make a Bignum of the correct size instead of shifting? 
        var bn = new Bignum(msb);
        for(var i = 1; i < 2**exponent; i++) { // if just 1 byte, our UInt8 was enough, otherwhise we need to enlarge 
            bn = bn.shiftLeft(8);
            bn = bn.add(buffer.readUInt8(offset++));
        }
        return {
            value: bn,
            offset: offset
        };
    }

    private static encodeNumber(num: number): Buffer {
        return this.encodeBignum(new Bignum(num));
    }

    // REFACTOR TODO: rename this, because it doesn't calculate the amount of bytes needed, but rather the exponent to 2 to get the amount of bytes
    // e.g., if this returns 3, the amount of bytes is 2^3=8, not 3
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
}

export interface VLIEOffset {
    value: Bignum, 
    offset: number
}