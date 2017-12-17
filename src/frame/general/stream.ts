import {Bignum} from '../../utilities/bignum';
import {BaseFrame, FrameType} from '../base.frame';



export class StreamFrame extends BaseFrame {
    private isFinal: boolean; // set fin bit
    private isLast: boolean; // if true, don't set length
    private isFirst: boolean; // if true, no offset required

    private streamID: Bignum;
    private length: Bignum;
    private offset: Bignum;

    private data: Buffer;

    public constructor(data: Buffer) {
        super(FrameType.STREAM);
        this.data = data;
    }

    public toBuffer(): Buffer {
        throw new Error("Method not implemented.");
    }



    /**
     * START Getters & Setters
     */

	public getIsFinal(): boolean {
		return this.isFinal;
	}

	public setIsFinal(value: boolean) {
		this.isFinal = value;
	}

	public getIsLast(): boolean {
		return this.isLast;
	}

	public setIsLast(value: boolean) {
		this.isLast = value;
    }
    
    public getIsFirst(): boolean {
        return this.isFirst;
    }

    public setIsFirst(value: boolean) {
        this.isFirst = value;
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

    /**
     * End Getters & Setters
     */
}