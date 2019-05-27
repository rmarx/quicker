import {Connection} from './connection';
import {Bignum} from '../types/bignum';
import { EndpointType } from '../types/endpoint.type';
import { TransportParameterId } from '../crypto/transport.parameters';
import { FlowControlledObject } from '../flow-control/flow.controlled';
import { QuicError } from '../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { Constants } from '../utilities/constants';
import { VerboseLogging } from '../utilities/logging/verbose.logging';

interface BufferedData {
    data: Buffer,
    offset:Bignum,
	isFin: boolean
};

export class Stream extends FlowControlledObject {
	
	private endpointType: EndpointType;
	private streamID: Bignum;
	private blockedSent!: boolean;
	private streamState: StreamState;
	private finalReceivedOffset!: Bignum;
	private finalSentOffset!: Bignum;
	private data!: Buffer;
    private bufferedData!:Array<BufferedData>;
    private bufferedDataIsSorted!:boolean;

	
    public constructor(endpointType: EndpointType, streamID: Bignum, bufferSize: number = Constants.DEFAULT_MAX_STREAM_DATA) {
		super(bufferSize);
		this.endpointType = endpointType;
		this.streamID = streamID;
        this.streamState = StreamState.Open;
        this.reset();
	}
	
	public reset(): void {
		this.blockedSent = false;
		this.resetOffsets();
		this.data = Buffer.alloc(0);
        this.bufferedData = new Array<BufferedData>();
        this.bufferedDataIsSorted = false;
	}

	public getStreamID(): Bignum {
		return this.streamID;
	}

	public setStreamID(value: Bignum): void {
		this.streamID = value;
	}

	public getBlockedSent(): boolean {
		return this.blockedSent;
	}

	public setBlockedSent(value: boolean): void {
		this.blockedSent = value;
	}

	public getStreamState(): StreamState {
		return this.streamState;
	}

	public setStreamState(state: StreamState): void {
		this.streamState = state;
    }
    

	public getFinalSentOffset(): Bignum {
		return this.finalSentOffset;
	}

	public setFinalSentOffset(finalOffset: Bignum): void {
		this.finalSentOffset = finalOffset;
    }
    
    public getCurrentSentOffset():Bignum {
        return this.getRemoteOffset();
    }

    public getCurrentReceivedOffset():Bignum {
        return this.getLocalOffset();
    }

	public addData(newData: Buffer, isFin = false): void {
		if (this.blockedSent) {
			throw new Error("stream:addData: send was blocked");
        }
        
        this.data = Buffer.concat([this.data, newData]);
        
		if (isFin) {
            // FIXME: this is not correct: if we do popData anywhere in between these addData's, the remoteOffset will be erroneous! 
			this.finalSentOffset = this.getCurrentSentOffset().add(this.data.byteLength);
		}
    }

	public popData(size: number = this.data.byteLength): Buffer {
		var buf = this.data.slice(0, size);
		this.data = this.data.slice(size);
		return buf;
	}

	public getOutgoingDataSize(): number {
		return this.data.byteLength;
	}

    public isSendOnly(): boolean {
		return Stream.isSendOnly(this.endpointType, this.streamID);
    }

    public isReceiveOnly(): boolean {
		return Stream.isReceiveOnly(this.endpointType, this.streamID);
	}
	
	public isUniStream(): boolean {
		return Stream.isUniStreamId(this.streamID);
	}
	
	public isBidiStream(): boolean {
		return Stream.isBidiStreamId(this.streamID);
	}
	
	public isLocalStream(): boolean {
		// server streams: 0x1 and 0x3 -> 01 and 11 -> id & 1 should give 1 for server-streams
		let serverOpened = this.streamID.and( new Bignum(1) ).equals( new Bignum(1) );

		return (this.endpointType == EndpointType.Server) ? serverOpened : !serverOpened;
	}

	public isRemoteStream(): boolean {
		return !this.isLocalStream();
	}

	public receiveData(data: Buffer, offset: Bignum, isFin: boolean): void {

		if (this.finalReceivedOffset !== undefined && offset.add(data.byteLength).greaterThan(this.finalReceivedOffset)) {
			throw new QuicError(ConnectionErrorCodes.FINAL_OFFSET_ERROR, "Stream:receiveData: receiving data past the end of the FIN'ed stream : " + offset.add(data.byteLength).toDecimalString() + " > " + this.finalReceivedOffset.toDecimalString() + " in stream " + this.streamID.toDecimalString() );
        }

        // Want to deal with out-of-order data AND overlapping data 
        // to do this, we keep a list of buffered data, SORTED on offset
        // when data comes in, we process this buffered list in offset order
        
        // 1. offset is exactly one more than current: which *should* always happen without loss/reordering
		if ( offset.equals(this.getCurrentReceivedOffset()) ){
            VerboseLogging.trace("Stream:receiveData : 1 : data exactly as expected : " + offset.toDecimalString() );
            this.bubbleUpReceivedData(data, isFin);
            if( !isFin )
                this.checkBufferedData();
            else{
                VerboseLogging.debug("Stream:receiveData : stream delivered in-full : emptying buffered data : " + this.bufferedData.length );
                for( let item of this.bufferedData ){
                    VerboseLogging.debug("Stream:receiveData : stream delivered in-full : emptying buffered data : [" + item.offset.toDecimalString() + ", " + item.offset.add(item.data.byteLength).toDecimalString() + "]");
                }
                
                this.bufferedData = new Array<BufferedData>();
            }
        } 
        // 2. offset is "in the future" : just buffer until further notice
        else if (offset.greaterThan(this.getCurrentReceivedOffset())) {
            VerboseLogging.trace("Stream:receiveData : 2 : data too far ahead, buffering : " + offset.toDecimalString() );
            this.addBufferedData(data, offset, isFin);
            // No need to call checkBuffered here: we didn't add anything to the buffer that could trigger a proper call to this function
        } 
        // 3. here, it's implied that offset is < currentReceivedOffset
        // two cases remain: either it's completely below and we discard it (3.), or it's partially below and we split the data (4.)
        else if( offset.add(data.byteLength).lessThanOrEqual(this.getCurrentReceivedOffset()) ){
			// Offset is smaller than local offset
            // --> data is already received by the application, thus ignore data.
            VerboseLogging.debug("Stream:receiveData : 3 : data was completely below current received offset, ignoring. " + this.getCurrentReceivedOffset().toDecimalString() + " > " + offset.toDecimalString() + " and >= " + offset.add(data.byteLength).toDecimalString() );
        }
        //4. partial overlap, this is where it gets nasty
        else {
            VerboseLogging.debug("Stream:receiveData : 4 : data partially overlaps, adjusting and redoing : " + this.getCurrentReceivedOffset().toDecimalString() + " between " + offset.toDecimalString() + " and " + offset.add(data.byteLength).toDecimalString() );
            // representation of situation: 
            // .....................|  < current offset
            //             |..................| < incoming data
            // we can safely process this data first, before looking at the buffers, since this one will always contain SOME directly usable data
            // it could be stuff that was already buffered (partially) overlaps this of course, but then it will be discardeed in 3. or processed in 4.

            // example: current offset is at 15
            //     ...........14|15
            // incoming offset is 13
            //     .......|13 14|15
            // 15 - 13 = 2. Data index 2 = 15 (0 = 13, 1 = 14), so 2 is our direct index into the data buffer
            let firstNewOffset:number = this.getCurrentReceivedOffset().subtract( offset ).toNumber();
            let nonOverlappingData:Buffer = data.slice(firstNewOffset);
            this.receiveData( nonOverlappingData, this.getCurrentReceivedOffset(), isFin);
            // No need to call checkBuffered here : this *should* immediately execute 1., which processed any buffered data 
		}
	}

	private bubbleUpReceivedData(data: Buffer, isFin: boolean): void {
		this.emit(StreamEvent.DATA, data);
        this.addLocalOffset(data.byteLength); // addCurrentReceivedOffset

        VerboseLogging.debug("Stream:bubbleUpReceivedData : new current received offset is at " + this.getCurrentReceivedOffset().toDecimalString() );
        
        if (isFin) {
            this.finalReceivedOffset = this.getCurrentReceivedOffset();

            if (this.getStreamState() === StreamState.Open) {
                this.setStreamState(StreamState.LocalClosed);
            } 
            else if (this.getStreamState() === StreamState.RemoteClosed) {
                this.setStreamState(StreamState.Closed);
            }

            this.emit(StreamEvent.END);
        }
	}


	private checkBufferedData(): void {
        // TODO: potentially best to use insertion-sort here, but since that leads to re-allocation in JS anyway, it probably doesn't matter
        // TODO: still... test and make sure this is better optimized
        // TODO: now, this function is also called EVERY TIME for each new buffer check, even if we know things are sorted! 

        if( this.bufferedData.length === 0 )
            return;

        // logic is that we sort based on the offset, as we can only process things in-order either way
        if( !this.bufferedDataIsSorted ){
            // sort is in-place
            this.bufferedData.sort( (a:BufferedData, b:BufferedData):number => {
                return a.offset.compare( b.offset );
            });
        }

        let firstUp = this.bufferedData[0];
        VerboseLogging.debug("Stream:checkBufferedData : Checking candidate data " + firstUp.offset.toDecimalString() + ", length " + firstUp.data.byteLength + ". " + (this.bufferedData.length - 1) + " items left in the buffer" );

        // we are fully sorted. If this offset is > what we expect, nothing behind us is going to be ready for use, so we can stop
        // this is one of our "recursion" stop conditions
        if( firstUp.offset.greaterThan(this.getCurrentReceivedOffset()) ){
            VerboseLogging.debug("Stream:checkBufferedData : first candidate's offset was too large");
            return;
        }


        // right here, we're sure this can be processed, 
        // either in full (receiveData:1) or partially (receiveData:4) or discarded (receiveData:3) but never put back into the buffer (receiveData:2)
        // that's why we have the greaterThan(this.getCurrentReceivedOffset()) above 
        firstUp = this.bufferedData.shift()!;
        this.receiveData( firstUp.data, firstUp.offset, firstUp.isFin );
	}

    /*
    private popBufferedData(localOffset: Bignum): BufferedData | undefined {
		var offsetString: string = localOffset.toDecimalString();
        if (this.bufferedData[offsetString] !== undefined) {
			var bufferedData = this.bufferedData[offsetString];
			delete this.bufferedData[offsetString];
			this.decrementBufferSizeUsed(bufferedData.data.byteLength);
            return bufferedData;
        }
        return undefined;
    }
    */

    private addBufferedData(data: Buffer, offset: Bignum, isFin: boolean): void {
        
        this.bufferedData.push( {
            data: data,
            offset: offset,
            isFin: isFin
        });

        this.bufferedDataIsSorted = false;

		this.incrementBufferSizeUsed(data.byteLength);
	}

	public static isLocalStream(endpointType: EndpointType, streamID: Bignum): boolean {
		// server streams: 0x1 and 0x3 -> 01 and 11 -> id & 1 should give 1 for server-streams
		let serverOpened = streamID.and( new Bignum(1) ).equals( new Bignum(1) );

		return (endpointType == EndpointType.Server) ? serverOpened : !serverOpened;
	}

	public static isRemoteStream(endpointType: EndpointType, streamID: Bignum): boolean {
		return !Stream.isLocalStream(endpointType, streamID);
	}

    public static isSendOnly(endpointType: EndpointType, streamID: Bignum): boolean {
        if (endpointType === EndpointType.Server) {
            return streamID.xor(StreamType.ServerUni).modulo(4).equals(0);
        }
        return streamID.xor(StreamType.ClientUni).modulo(4).equals(0);
    }

    public static isReceiveOnly(endpointType: EndpointType, streamID: Bignum): boolean {
        if (endpointType === EndpointType.Server) {
            return streamID.xor(StreamType.ClientUni).modulo(4).equals(0);
        }
        return streamID.xor(StreamType.ServerUni).modulo(4).equals(0);
	}
	
	public static isUniStreamId(streamId: Bignum): boolean {
        return streamId.and(new Bignum(2)).equals(new Bignum(2));
    }
	
	public static isBidiStreamId(streamId: Bignum): boolean {
        return !this.isUniStreamId(streamId);
    }
}

export enum StreamState {
	// Remote and Local open
	Open, 
	// Remote closed, Local open
	RemoteClosed, 
	// Local closed, Remote open
	LocalClosed, 
	// Remote and Local closed
	Closed
}

export enum StreamType {
	ClientBidi = 0x00, 
	ServerBidi = 0x01,
	ClientUni = 0x02,
	ServerUni = 0x03
}

export enum StreamEvent {
	DATA = "stream-data",
	END = "stream-end",
}