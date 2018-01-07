import { Bignum } from "../types/bignum";
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

    static decode(buf: Buffer, offset?: number): Bignum;
    static decode(str: string): Bignum;
    public static decode(obj: any, offset: number = 0): Bignum {
        if (obj instanceof Buffer) {
            return VLIE.decodeBuffer(obj, offset);
        }
        return VLIE.decodeString(obj);
    }

    private static encodeBignum(bignum: Bignum): Buffer {
        var count = this.getBytesNeeded(bignum);
        var bn = Bignum.fromNumber(count);
        for(var i = 0; i < (2**count - 1); i++) {
            bn = bn.shiftLeft(8);
        }
        bn = bn.shiftLeft(6);
        bn = bn.add(bignum);
        return bn.toBuffer(2**count);
    }

    private static decodeBuffer(buffer: Buffer, offset: number): Bignum {
        var msb = buffer.readUInt8(offset);
        var count = 0;
        if(msb & 0x40) {
            count += 1;
            msb -= 0x40;
        }
        if(msb & 0x80) {
            count += 2;
            msb -= 0x80;
        }
        var bn = Bignum.fromNumber(msb);
        for(var i = 1; i < 2**count; i++) {
            bn = bn.shiftLeft(8);
            bn = bn.add(buffer.readUInt8(offset + i));
        }
        return bn;
    }

    private static decodeString(str: string): Bignum {
        return this.decodeBuffer(Buffer.from(str, 'hex'), 0);
    }

    private static encodeNumber(num: number): Buffer {
        return this.encodeBignum(Bignum.fromNumber(num));
    }

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