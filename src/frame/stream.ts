import {VLIE} from '../types/vlie';
import {Bignum} from '../types/bignum';
import {BaseFrame, FrameType} from './base.frame';



export class StreamFrame extends BaseFrame {
    private fin: boolean; // set fin bit
    private len: boolean; // if true, don't set length
    private off: boolean; // if true, no offset required

    private streamID: Bignum;
    private length: Bignum;
    private offset: Bignum;

    private data: Buffer;

    public constructor(streamID: Bignum, data: Buffer) {
        super(FrameType.STREAM, true);
        this.streamID = streamID;
        this.data = data;
        this.fin =  false;
        this.len = false;
        this.off = false;
        this.length = new Bignum(0);
        this.offset = new Bignum(0);
    }

    public toBuffer(): Buffer {
        var type = this.getType();
        var size = 1;
        var streamIDBuffer = VLIE.encode(this.streamID);
        size += streamIDBuffer.byteLength;
        var lengthBuffer = undefined;
        var offsetBuffer = undefined;

        if (this.len) {
            lengthBuffer = VLIE.encode(this.length)
            size += lengthBuffer.byteLength;
        }

        if (this.off) {
            offsetBuffer = VLIE.encode(this.offset)
            size += offsetBuffer.byteLength;
        }

        var buffer = Buffer.alloc(size + this.data.byteLength);
        var offset = 0;
        buffer.writeUInt8(type, offset++);
        streamIDBuffer.copy(buffer, offset);
        offset += streamIDBuffer.byteLength;
        if (this.off && offsetBuffer !== undefined) {
            offsetBuffer.copy(buffer, offset);
            offset += offsetBuffer.byteLength;
        }
        if (this.len && lengthBuffer !== undefined) {
            lengthBuffer.copy(buffer, offset);
            offset += lengthBuffer.byteLength;
        }
        this.data.copy(buffer, offset);
        return buffer;
    }

    public getType(): number {
        var type: number = super.getType();
        if (this.fin) {
            type += 0x01;
        }
        if (this.len) {
            type += 0x02;
        }
        if (this.off) {
            type += 0x04;
        }
        return type;
    }


    /**
     * START Getters & Setters
     */

	public getFin(): boolean {
		return this.fin;
	}

	public setFin(value: boolean) {
		this.fin = value;
	}

	public getLen(): boolean {
		return this.len;
	}

	public setLen(value: boolean) {
		this.len = value;
    }
    
    public getOff(): boolean {
        return this.off;
    }

    public setOff(value: boolean) {
        this.off = value;
    }

    public getStreamID(): Bignum {
        return this.streamID;
    }

    public setStreamID(streamID: Bignum) {
        this.streamID = streamID;
    }
    
    public getLength(): Bignum {
        return this.length;
    }

    public setLength(value: Bignum) {
        this.len = true;
        this.length = value;
    }

    public getOffset(): Bignum {
        return this.offset;
    }

    public setOffset(value: Bignum) {
        this.off = true;
        this.offset = value;
    }

    public getData(): Buffer {
        return this.data;
    }

    public setData(buf: Buffer) {
        this.data = buf;
    }

    /**
     * End Getters & Setters
     */
}