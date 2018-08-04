import {VLIE} from '../crypto/vlie';
import {Bignum} from '../types/bignum';
import {BaseFrame, FrameType} from './base.frame';

export class CryptoFrame extends BaseFrame {

    private data: Buffer;
    private length: Bignum;
    private offset: Bignum;

    public constructor(data: Buffer, length: Bignum, offset: Bignum) {
        super(FrameType.CRYPTO, true);
        this.data = data;

        this.length = length;
        this.offset = offset;
    }

    public toBuffer(): Buffer {
        var lengthBuffer = undefined;
        var offsetBuffer = undefined;
        var size = 0;


        lengthBuffer = VLIE.encode(this.length);
        size += lengthBuffer.byteLength;

        offsetBuffer = VLIE.encode(this.offset);
        size += offsetBuffer.byteLength;


        var buffer = Buffer.alloc(size + this.data.byteLength);
        var writeoffset = 0;

        offsetBuffer.copy(buffer, writeoffset);
        writeoffset += offsetBuffer.byteLength;

        lengthBuffer.copy(buffer, writeoffset);
        writeoffset += lengthBuffer.byteLength; 

        this.data.copy(buffer, writeoffset);
        return buffer;
    }

    public getLength(): Bignum {
        return this.length;
    }

    public setLength(value: Bignum) {
        this.length = value;
    }

    public getOffset(): Bignum {
        return this.offset;
    }

    public setOffset(value: Bignum) {
        this.offset = value;
    }

    public getData(): Buffer {
        return this.data;
    }

    public setData(buf: Buffer) {
        this.data = buf;
    }
}