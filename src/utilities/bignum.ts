import { fromBuffer, add, rand, eq, gt, lt } from "bignum";


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
    public add(num: Bignum): void {
        var bn = add(this.bignum,num.bignum);
        this.bignum = bn;
    }

    /**
     * Checks if the bignum value of this instance is the same as the value of num
     * @param num 
     */
    public equals(num: Bignum): boolean {
        return eq(this.bignum, num.bignum);
    }

    /**
     * Checks if the bignum value of this instance is greater than the value of num
     * @param num 
     */
    public greaterThan(num: Bignum): boolean {
        return gt(this.bignum, num.bignum);
    }

    /**
     * Checks if the bignum value of this instance is less than the value of num
     * @param num 
     */
    public lessThan(num: Bignum): boolean {
        return lt(this.bignum, num.bignum);
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