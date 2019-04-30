import { BN, Endianness } from "bn.js";


/**
 * Helper class for the bignum library
 */
export class Bignum {

    private bignum: BN;
    private byteSize: number | undefined;

    /**
     * @param buf buffer containing the number
     * @param byteSize bytesize, default calculated by Bignum class
     * @param base base, default 16 (hex)
     */
    constructor(num: number, byteSize?: number);
    constructor(buf: Buffer, byteSize?: number, base?: number);
    public constructor(obj: any, byteSize?: any, base?: any) {
        this.bignum = new BN(0);
        if (obj instanceof Buffer) {
            this.fromBuffer(obj, byteSize, base);
        } else if (typeof obj == 'number') {
            this.byteSize = byteSize;
            this.bignum = new BN(obj);
        }
    }

    /**
     * Add function to add the value of the parameter bignum to the value of the bignum object from this instance
     * @param num with type Bignum
     */
    add(num: Bignum): Bignum;
    /**
     * Add function to add the value a number to the instance bignum value
     * @param num 
     */
    add(num: number): Bignum;
    public add(num: any): Bignum {
        var bn = new Bignum(0);
        if (num instanceof Bignum) {
            bn.bignum = this.bignum.add(num.bignum);
        } else {
            bn.bignum = this.bignum.add(new BN(num));
        }
        return bn;
    }

    public subtract(num: number): Bignum;
    public subtract(num: Bignum): Bignum;
    public subtract(num: any): Bignum {
        var bn = new Bignum(0);
        if (num instanceof Bignum) {
            bn.bignum = this.bignum.sub(num.bignum);
        } else {
            bn.bignum = this.bignum.sub(new BN(num));
        }
        return bn;
    }

    public multiply(num: number): Bignum;
    public multiply(num: Bignum): Bignum;
    public multiply(num: any): Bignum {
        var bn = new Bignum(0);
        if (num instanceof Bignum) {
            bn.bignum = this.bignum.mul(num.bignum);
        } else {
            bn.bignum = this.bignum.mul(new BN(num));
        }
        return bn;
    }

    public divide(num: number): Bignum;
    public divide(num: Bignum): Bignum;
    public divide(num: any): Bignum {
        var bn = new Bignum(0);
        if (num instanceof Bignum) {
            bn.bignum = this.bignum.div(num.bignum);
        } else {
            bn.bignum = this.bignum.div(new BN(num));
        }
        return bn;
    }

    public and(num: number): Bignum;
    public and(num: Bignum): Bignum;
    public and(num: any): Bignum {
        let bn = new Bignum(0);
        if (num instanceof Bignum) {
            bn.bignum = this.bignum.and(num.bignum);
        } else {
            bn.bignum = this.bignum.and(new BN(num));
        }
        return bn;
    }

    public or(num: number): Bignum;
    public or(num: Bignum): Bignum;
    public or(num: any): Bignum {
        let bn = new Bignum(0);
        if (num instanceof Bignum) {
            bn.bignum = this.bignum.or(num.bignum);
        } else {
            bn.bignum = this.bignum.or(new BN(num));
        }
        return bn;
    }

    public notn(bitwidth: number): Bignum {
        let bn = new Bignum(0);
        bn.bignum = this.bignum.notn(bitwidth);
        return bn;
    }

    public modulo(num: number): Bignum;
    public modulo(num: Bignum): Bignum;
    public modulo(num: any): Bignum {
        if (num instanceof Bignum) {
            return Bignum.fromBN(this.bignum.mod(num.bignum));
        } else {
            return Bignum.fromBN(this.bignum.mod(new BN(num)));
        }
    }

    public mask(bytesize: number): Bignum {
        return Bignum.fromBN(this.bignum.maskn(bytesize * 8));
    }

    /**
     * Exclusive or operation
     * @param num 
     */
    public xor(num: number): Bignum;
    public xor(num: Bignum): Bignum;
    public xor(num: any): Bignum {
        var bn = new Bignum(0);
        if (num instanceof Bignum) {
            bn.bignum = this.bignum.xor(num.bignum);
        } else {
            bn.bignum = this.bignum.xor(new BN(num));
        }
        return bn;
    }

    /**
     * Method to perform left shifts
     * @param num any number
     */
    public shiftLeft(num: number): Bignum {
        var bn = new Bignum(0);
        bn.bignum = this.bignum.shln(num);
        return bn;
    }

    /**
     * Checks if the bignum value of this instance is the same as the value of num
     * @param num 
     */
    equals(num: Bignum): boolean;
    equals(num: number): boolean;
    public equals(num: any): boolean {
        if (num instanceof Bignum) {
            return this.bignum.eq(num.bignum);
        } else {
            return this.bignum.eq(new BN(num));
        }
    }

    /**
     * Checks if the bignum value of this instance is greater than the value of num
     * @param num 
     */
    greaterThan(num: number): boolean;
    greaterThan(num: Bignum): boolean;
    public greaterThan(num: any): boolean {
        if (num instanceof Bignum) {
            return this.bignum.gt(num.bignum);
        }
        return this.bignum.gt(new BN(num));
    }

    greaterThanOrEqual(num: number): boolean;
    greaterThanOrEqual(num: Bignum): boolean;
    public greaterThanOrEqual(num: any): boolean {
        if (num instanceof Bignum) {
            return this.bignum.gte(num.bignum);
        }
        return this.bignum.gte(new BN(num));
    }

    /**
     * Checks if the bignum value of this instance is less than the value of num
     * @param num 
     */
    lessThan(num: number): boolean;
    lessThan(num: Bignum): boolean;
    public lessThan(num: any): boolean {
        if (num instanceof Bignum) {
            return this.bignum.lt(num.bignum);
        }
        return this.bignum.lt(new BN(num));
    }

    lessThanOrEqual(num: number): boolean;
    lessThanOrEqual(num: Bignum): boolean;
    public lessThanOrEqual(num: any): boolean {
        if (num instanceof Bignum) {
            return this.bignum.lte(num.bignum);
        }
        return this.bignum.lte(new BN(num));
    }

    public compare(num: Bignum): number {
        return this.bignum.cmp(num.bignum);
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
        return this.bignum.toBuffer('be', bSize).toString(encoding);
    }

    public toDecimalString(): string {
        return this.bignum.toString(10);
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

    public setByteLength(value: number): void {
        this.byteSize = value;
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
        if (num.toString(10) !== '0') {
            num = num.mod(high.bignum);
        }

        return this.fromBN(num);
    }

    private static infinityHex: string;

    public static infinity(): Bignum {
        if (this.infinityHex === undefined) {
            var x = new Bignum(1);
            // only calculate this once and then store it in infinityHex
            x.bignum = x.bignum.shln(65);
            this.infinityHex = x.toString('hex');
            return x;
        }
        return new Bignum(Buffer.from(this.infinityHex, 'hex'));
    }

    /**
     * Returns the biggest value between the two given bignum objects
     * @param b1 
     * @param b2 
     */
    static max(b1: number, b2: number): Bignum;
    static max(b1: Bignum, b2: number): Bignum;
    static max(b1: number, b2: Bignum): Bignum;
    static max(b1: Bignum, b2: Bignum): Bignum;
    public static max(b1: any, b2: any): Bignum {
        if (b1 instanceof Bignum) {
            return b1.greaterThanOrEqual(b2) ? b1 : (b2 instanceof Bignum ? b2 : new Bignum(b2));
        }
        return new Bignum(b1).greaterThanOrEqual(b2) ? b1 : (b2 instanceof Bignum ? b2 : new Bignum(b2));
    }

    /**
     * Returns the smallest value between the two given bignum objects
     * @param b1 
     * @param b2 
     */
    static min(b1: number, b2: number): Bignum;
    static min(b1: Bignum, b2: number): Bignum;
    static min(b1: number, b2: Bignum): Bignum;
    static min(b1: Bignum, b2: Bignum): Bignum;
    public static min(b1: any, b2: any): Bignum {
        if (b1 instanceof Bignum) {
            return b1.lessThan(b2) ? b1 : (b2 instanceof Bignum ? b2 : new Bignum(b2));
        }
        return new Bignum(b1).lessThan(b2) ? b1 : (b2 instanceof Bignum ? b2 : new Bignum(b2));
    }

    static abs(num: number): Bignum;
    static abs(num: Bignum): Bignum;
    public static abs(obj: any): Bignum {
        if (!(obj instanceof Bignum)) {
            var bn = new Bignum(obj);
        } else {
            var bn = obj;
        }
        return Bignum.fromBN(bn.bignum.abs());
    }

    /**
     * Function to create a BN object with a value between 0 (incl) and 256 (excl)
     */
    private static mathRandom(): BN {
        return new BN(Math.random() * 256);
    }

    private static fromBN(bn: BN): Bignum {
        var bignum = new Bignum(0)
        bignum.bignum = bn;
        return bignum;
    }
}