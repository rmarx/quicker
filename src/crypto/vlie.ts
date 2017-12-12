import { Bignum } from "./../utilities/bignum";
import { Buffer } from "buffer";

/**
 * Variable Length Integer Encoding
 */
export class VLIE {

    static encode(bignum: Bignum): Buffer;
    static encode(num: number): Buffer;
    public static encode(number: any): Buffer {
        if (number instanceof Bignum) {
            return VLIE.encodeBignum(number);
        }
        return VLIE.encodeNumber(number);
    }

    static decode(buf: Buffer): Bignum;
    static decode(str: string, encoding?: string): Bignum;
    public static decode(obj: any, encoding: string = 'hex'): Bignum {
        if (obj instanceof Buffer) {
            return VLIE.decodeBuffer(obj);
        }
        return VLIE.decodeString(obj);
    }

    private static encodeBignum(bignum: Bignum): Buffer {
        var count = this.getBytesNeeded(bignum);
        var bn = Bignum.fromNumber(count);
        for(var i = 0; i < (2**count - 1); i++) {
            bn.shiftLeft(8);
        }
        bn.shiftLeft(6);
        bn.add(bignum);
        return bn.toBuffer(2**count);
    }

    private static decodeBuffer(buffer: Buffer): Bignum {
        var msb = buffer.readUInt8(0);
        console.log('buffer: ' + buffer.toString('hex'));
        console.log("msb: " + msb.toString(16));
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
            console.log(`reading: ${i}`)
            bn.shiftLeft(8);
            bn.add(buffer.readUInt8(i));
        }
        return bn;
    }

    private static decodeString(str: string): Bignum {
        return this.decodeBuffer(Buffer.from(str, 'hex'));
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