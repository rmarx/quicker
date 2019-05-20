import {VLIE} from '../types/vlie';
import {Bignum} from '../types/bignum';
import {BaseFrame, FrameType} from './base.frame';
import {EncryptionLevel} from '../crypto/crypto.context'

export class CryptoFrame extends BaseFrame {

    // mainly needed for easier statekeeping without having to pass this along everywhere we want to handle Crypto frames (e.g., send logic)
    // TODO: refactor flowcontrol further so this isn't needed? 
    private cryptoLevel?:EncryptionLevel; 

    private data: Buffer;
    private length: Bignum;
    private offset: Bignum;

    public constructor(data: Buffer, length: Bignum, offset: Bignum) {
        super(FrameType.CRYPTO, true);
        this.data = data;

        this.length = length;
        this.offset = offset;
    }

    public setCryptoLevel(level:EncryptionLevel){
        this.cryptoLevel = level;
    }

    public getCryptoLevel(): EncryptionLevel|undefined {
        return this.cryptoLevel;
    }

    public toBuffer(): Buffer {
        let lengthBuffer = undefined;
        let offsetBuffer = undefined;
        let size = 0;

        let type = this.getType();
        size += 1;

        lengthBuffer = VLIE.encode(this.length);
        size += lengthBuffer.byteLength;

        offsetBuffer = VLIE.encode(this.offset);
        size += offsetBuffer.byteLength;


        
        var buffer = Buffer.alloc(size + this.data.byteLength);
        var writeoffset = 0;

        buffer.writeUInt8(type, writeoffset);
        writeoffset += 1;

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