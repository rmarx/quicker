import {Connection} from './connection';
import {Bignum} from '../types/bignum';
import { EndpointType } from '../types/endpoint.type';
import { TransportParameterType } from '../crypto/transport.parameters';
import { FlowControlledObject } from '../flow-control/flow.controlled';
import { QuicError } from '../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { Constants } from '../utilities/constants';

interface BufferedData {
	data: Buffer,
	isFin: boolean
};

export class Stream extends FlowControlledObject {
	
	private endpointType: EndpointType;
	private streamID: Bignum;
	private blockedSent: boolean;
	private streamState: StreamState;
	private localFinalOffset!: Bignum;
	private remoteFinalOffset!: Bignum;
	private data: Buffer;
	private bufferedData: { [key: string]: BufferedData };

	
    public constructor(endpointType: EndpointType, streamID: Bignum, bufferSize: number = Constants.DEFAULT_MAX_STREAM_DATA) {
		super(bufferSize);
		this.endpointType = endpointType;
		this.streamID = streamID;
		this.streamState = StreamState.Open;
		this.blockedSent = false;
		this.data = Buffer.alloc(0);
		this.bufferedData = {};
	}
	
	public reset(): void {
		this.blockedSent = false;
		this.resetOffsets();
		this.data = Buffer.alloc(0);
		this.bufferedData = {};
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

	public getLocalFinalOffset(): Bignum {
		return this.localFinalOffset;
	}

	public setLocalFinalOffset(finalOffset: Bignum): void {
		this.localFinalOffset = finalOffset;
	}

	public getRemoteFinalOffset(): Bignum {
		return this.remoteFinalOffset;
	}

	public setRemoteFinalOffset(finalOffset: Bignum): void {
		this.remoteFinalOffset = finalOffset;
	}

	public addData(data: Buffer, isFin = false): void {
		if (this.blockedSent) {
			throw new Error("stream:addData: send was blocked");
		}
		this.data = Buffer.concat([this.data, data]);
		if (isFin) {
			this.remoteFinalOffset = this.getRemoteOffset().add(this.data.byteLength);
		}
	}
	
	public resetData(): void {
		this.data = Buffer.alloc(0);
	}

	public setData(data: Buffer): void {
		this.data = data;
	}

	public popData(size: number = this.data.byteLength): Buffer {
		var buf = this.data.slice(0, size);
		this.data = this.data.slice(size);
		return buf;
	}

	public getOutgoingDataSize(): number {
		return this.data.byteLength;
	}

	public getData(size: number = this.data.byteLength): Buffer {
		var buf = Buffer.alloc(size);
		this.data.copy(buf, 0, 0, size);
		return buf;
	}

    public isSendOnly(): boolean {
		return Stream.isSendOnly(this.endpointType, this.streamID);
    }

    public isReceiveOnly(): boolean {
		return Stream.isReceiveOnly(this.endpointType, this.streamID);
    }

	public receiveData(data: Buffer, offset: Bignum, isFin: boolean): void {
		if (this.localFinalOffset !== undefined && offset.add(data.byteLength).greaterThan(this.localFinalOffset)) {
			throw new QuicError(ConnectionErrorCodes.FINAL_OFFSET_ERROR);
		}
		if (offset.equals(this.getLocalOffset())) {
			this._receiveData(data, isFin);
			this.checkBufferedData();
		} else if (offset.greaterThan(this.getLocalOffset())) {
			this.addBufferedData(data, offset, isFin);
		} else {
			// Offset is smaller than local offset
			// --> data is already received by the application, thus ignore data.
		}
	}

	private _receiveData(data: Buffer, isFin: boolean): void {
		this.emit(StreamEvent.DATA, data);
		this.addLocalOffset(data.byteLength);
        if (isFin) {
            this.setLocalFinalOffset(this.getLocalOffset());
            if (this.getStreamState() === StreamState.Open) {
                this.setStreamState(StreamState.LocalClosed);
            } else if (this.getStreamState() === StreamState.RemoteClosed) {
                this.setStreamState(StreamState.Closed);
			}
            this.emit(StreamEvent.END);
        }
	}


	private checkBufferedData(): void {
		var data = this.popBufferedData(this.getLocalOffset());
		while (data !== undefined) {
			this._receiveData(data.data, data.isFin)
			data = this.popBufferedData(this.getLocalOffset());
		}
	}

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

    private addBufferedData(data: Buffer, offset: Bignum, isFin: boolean): void {
		var offsetString: string = offset.toDecimalString();
        if (this.bufferedData[offsetString] === undefined) {
            this.bufferedData[offsetString] = {
				data: data,
				isFin: isFin
			};
			this.incrementBufferSizeUsed(data.byteLength);
        }
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