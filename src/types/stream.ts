import {Bignum} from './bignum';



export class Stream {
	private streamID: Bignum;
	
	private localOffset: Bignum;
	private remoteOffset: Bignum;
	private maxStreamData: Bignum;

    public constructor(streamID: Bignum, maxStreamData: Bignum) {
		this.streamID = streamID;
		this.localOffset = Bignum.fromNumber(0);
		this.remoteOffset = Bignum.fromNumber(0);
		this.maxStreamData = maxStreamData;
    }

	public getStreamID(): Bignum {
		return this.streamID;
	}

	public setStreamID(value: Bignum) {
		this.streamID = value;
	}

	public getLocalOffset(): Bignum {
		return this.localOffset;
	}

	public getRemoteOffset(): Bignum {
		return this.remoteOffset;
	}

	public addLocalOffset(offset: Bignum) {
		this.localOffset.add(offset);
	}

	public addRemoteOffset(offset: Bignum) {
		this.remoteOffset.add(offset);
	}

	public setMaxStreamData(maxStreamData: Bignum) {
		this.maxStreamData = maxStreamData;
	}

	public getMaxStreamData(): Bignum {
		return this.maxStreamData;
	}
    
}