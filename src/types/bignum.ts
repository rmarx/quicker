import { BN, Endianness } from "bn.js";


/**
 * Helper class for the bignum library
 */
export class Bignum {

    private bignum: BN;
    private byteSize: number | undefined;

    /**
     * @param buf buffer containing the number
     * @param byteSize bytesize, default 4 (32-bit)
     */
    public constructor(buf: Buffer, byteSize?: number, base: number = 16) {
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
            this.bignum = this.bignum.add(new BN(num));
        }
    }

    /**
     * Exclusive or operation
     * @param num 
     */
    public xor(num: Bignum) {
        this.bignum = this.bignum.xor(num.bignum);
    }

    /**
     * Method to perform left shifts
     * @param num any number
     */
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
    public toBuffer(size?: number): Buffer {
        var bSize = size === undefined ? this.byteSize : size;
        bSize = bSize !== undefined ? bSize : this.bignum.byteLength();
        return this.bignum.toBuffer('be', bSize);
    }

    /**
     * Create a bignum object from the buffer that is given
     * @param buf 
     */
    public fromBuffer(buf: Buffer, byteSize?: number, base: number = 16) {
        this.bignum = new BN(buf, base, 'be');
        this.byteSize = byteSize;
    }
    
    /**
     * gives the bignum value in string format (default hexadecimal)
     * @param encoding default hex
     */
    public toString(encoding: string = 'hex', size?: number): string {
        var bSize = size === undefined ? this.byteSize : size;
        return this.bignum.toBuffer('be', bSize).toString('hex');
    }

    /**
     * Only use when you are sure that bignum is smaller than 2^53
     */
    public toNumber(): number {
        return this.bignum.toNumber();
    }

    /**
     * Gives the index of the largest bit set
     */
    public getBitLength(): number {
        return this.bignum.bitLength();
    }

    public getByteLength(): number {
        var byteLength = this.byteSize !== undefined ? this.byteSize : this.bignum.byteLength();
        if (byteLength === 0)
            byteLength++;
        return byteLength;
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

    /**
     * Creates a Bignum object from a number 
     * @param num any number
     */
    public static fromNumber(num: number): Bignum {
        var bn = new BN(num);
        return new Bignum(bn.toBuffer('be'));
    }

    /**
     * Function to create a BN object with a value between 0 (incl) and 256 (excl)
     */
    private static mathRandom(): BN {
        return new BN(Math.random() * 256);
    }

    public static and(bn1: Bignum, bn2: Bignum) {
        var bn = bn1.bignum.and(bn2.bignum);
        return new Bignum(bn.toBuffer('be'));
    }

    public static mask(bn: Bignum, bytesize: number) {
        return new Bignum(bn.bignum.maskn(bytesize * 8).toBuffer('be'));
    }
}