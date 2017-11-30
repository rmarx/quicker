import { fromBuffer, add, rand, eq, gt, lt } from "bignum";


/**
 * Helper class for the bignum library
 */
export class Bignum {

    private bignum: any;
    private byteSize: number;

    /**
     * @param buf buffer containing the number
     * @param byteSize bytesize, default 4 (32-bit)
     */
    public constructor(buf: Buffer, byteSize: number = 4) {
        this.bignum = fromBuffer(buf);
        this.byteSize = byteSize;
    }

    /**
     * Add function to add the value of the parameter bignum to the value of the bignum object from this instance
     * @param num with type Bignum
     */
    add(num: Bignum): void;
    /**
     * Add function to add the value a number to the instance bignum value
     * @param num 
     */
    add(num: number): void;

    public add(num: any): void {
        if (num instanceof Bignum) {
            this.bignum = add(this.bignum, num.bignum);
        } else {
            this.bignum = add(this.bignum, num);
        }
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
        return this.bignum.toBuffer({ endian: 'big', size: this.byteSize });
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
     * @param byteSize bytesize: default 4 (32-bits)
     */
    public static random(lowHex: string, highHex: string, byteSize: number = 4): Bignum {
        var low = fromBuffer(Buffer.from(lowHex, 'hex'));
        var high = fromBuffer(Buffer.from(highHex, 'hex'));
        var bn = rand(low, high);
        return new Bignum(bn.toBuffer(), byteSize);
    }
}