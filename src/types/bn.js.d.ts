/**
 * Taken methods from https://github.com/machinomy/types-bn/blob/master/index.d.ts
 * but changed typings file a little bit
 */

import bnjs = require("bn.js");
import { Buffer } from 'buffer'

export as namespace bn;

type Endianness = 'le' | 'be'


export class BN {
    constructor(number: number | string | number[] | Buffer, base?: number, endian?: Endianness)
    clone(): BN
    toString(base?: number, length?: number): string
    toNumber(): number
    toJSON(): string
    toArray(endian?: Endianness, length?: number): number[]
    toBuffer(endian?: Endianness, length?: number): Buffer
    bitLength(): number
    zeroBits(): number
    byteLength(): number
    isNeg(): boolean
    isEven(): boolean
    isOdd(): boolean
    isZero(): boolean
    cmp(b: any): number
    lt(b: any): boolean
    lte(b: any): boolean
    gt(b: any): boolean
    gte(b: any): boolean
    eq(b: any): boolean
    isBN(b: any): boolean

    neg(): BN
    abs(): BN
    add(b: BN): BN
    sub(b: BN): BN
    mul(b: BN): BN
    sqr(): BN
    pow(b: BN): BN
    div(b: BN): BN
    mod(b: BN): BN
    divRound(b: BN): BN

    or(b: BN): BN
    and(b: BN): BN
    xor(b: BN): BN
    setn(b: number): BN
    shln(b: number): BN
    shrn(b: number): BN
    testn(b: number): boolean
    maskn(b: number): BN
    bincn(b: number): BN
    notn(w: number): BN

    gcd(b: BN): BN
    egcd(b: BN): { a: BN, b: BN, gcd: BN }
    invm(b: BN): BN
}