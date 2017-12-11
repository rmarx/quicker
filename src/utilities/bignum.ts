import { BN, Endianness } from "bn.js";


/**
 * Helper class for the bignum library
 */
export class Bignum {

    private bignum: BN;
    private byteSize: number;

    /**
     * @param buf buffer containing the number
     * @param byteSize bytesize, default 4 (32-bit)
     */
    public constructor(buf: Buffer, byteSize: number = 4, base: number = 16) {
        this.fromBuffer(buf, byteSize, base);
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
            this.bignum = this.bignum.add(num.bignum);
        } else {
            this.bignum = this.bignum.add(num);
        }
    }

    public shiftLeft(num: number): void {
        this.bignum = this.bignum.shln(num);
    }
    /**
     * Checks if the bignum value of this instance is the same as the value of num
     * @param num 
     */
    public equals(num: Bignum): boolean {
        return this.bignum.eq(num.bignum);
    }

    /**
     * Checks if the bignum value of this instance is greater than the value of num
     * @param num 
     */
    public greaterThan(num: Bignum): boolean {
        return this.bignum.gt(num.bignum);
    }

    /**
     * Checks if the bignum value of this instance is less than the value of num
     * @param num 
     */
    public lessThan(num: Bignum): boolean {
        return this.bignum.lt(num.bignum);
    }

    /**
     * Get the buffer from the bignum object
     */
    public toBuffer(): Buffer {
        return this.bignum.toBuffer('be');
    }

    /**
     * Create a bignum object from the buffer that is given
     * @param buf 
     */
    public fromBuffer(buf: Buffer, byteSize: number = 4, base: number = 16) {
        this.bignum = new BN(buf, base, 'be');
        this.byteSize = byteSize;
    }

    /**
     * gives the bignum value in string format (default hexadecimal)
     * @param encoding default hex
     */
    public toString(encoding: string = 'hex'): string {
        return this.bignum.toBuffer('be',this.byteSize).toString('hex');
    }

    public getHighestOccupied(): number {
        return this.bignum.bitLength();
    } 

    /**
     * Creates a Bignum object with a random value between 0 and highHex
     * @param highHex  upperbound (in hex)
     * @param byteSize bytesize: default 4 (32-bits)
     */
    public static random(highHex: string, byteSize: number = 4): Bignum {
        var high = new Bignum(Buffer.from(highHex, 'hex'), byteSize, 16);
        var num = new BN(0);
        for(var i = 0; i < byteSize; i++) {
            num = num.shln(8);
            num = num.add(this.mathRandom());
        }
        num = num.mod(high.bignum);

        return new Bignum(num.toBuffer('be'), byteSize, 10);
    }

    private static mathRandom(): BN {
        return new BN(Math.random() * 256);
    }
}