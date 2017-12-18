import {Bignum} from '../utilities/bignum';



export class Stream {
    private streamID: Bignum;

    public constructor(streamID: Bignum) {
        this.streamID = streamID;
    }

	public getStreamID(): Bignum {
		return this.streamID;
	}

	public setStreamID(value: Bignum) {
		this.streamID = value;
	}
    
}