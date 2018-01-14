import {Connection} from './connection';
import {Bignum} from './bignum';
import { EndpointType } from './endpoint.type';
import { TransportParameterType } from '../crypto/transport.parameters';
import { FlowControlledObject } from './flow.controlled';



export class Stream extends FlowControlledObject {
	
	private streamID: Bignum;
	private blockedSent: boolean;
	private streamState: StreamState;
	private localFinalOffset: Bignum;
	private remoteFinalOffset: Bignum;
	
    public constructor(connection: Connection, streamID: Bignum) {
		super();
        super.init(connection);
		this.streamID = streamID;
		this.streamState = StreamState.Open;
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