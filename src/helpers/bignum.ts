import { fromBuffer, add, rand } from "bignum";


/**
 * Helper class for the bignum library
 */
export class Bignum {
    
    private bignum: any;

    public constructor(buf: Buffer) {
        this.bignum = fromBuffer(buf);
    }

    /**
     * Add function to add the value of the parameter bignum to the value of the bignum object from this instance
     * @param num 
     */
    public add(num: Bignum) {
        var bn = add(this.bignum,num.bignum);
        this.bignum = bn;
    }

    /**
     * Get the buffer from the bignum object
     */
    public toBuffer(): Buffer {
        return this.bignum.toBuffer();
    }

    /**
     * Create a bignum object from the buffer that is given
     * @param buf 
     */
    public fromBuffer(buf: Buffer) {
        this.bignum = fromBuffer(buf);
    }

    /**
     * gives the bignum value in string format (default hexadecimal)
     * @param encoding default hex
     */
    public toString(encoding: string = 'hex'): string {
        return this.bignum.toBuffer().toString('hex');
    }

    /**
     * Creates a Bignum object with a random value between lowHex and highHex
     * @param lowHex lowerbound (in hex)
     * @param highHex  upperbound (in hex)
     */
    public static random(lowHex: string, highHex: string): Bignum {
        var low = fromBuffer(Buffer.from(lowHex,'hex'));
        var high = fromBuffer(Buffer.from(highHex,'hex'));
        var bn = rand(low, high);
        return new Bignum(bn.toBuffer());
    }
}