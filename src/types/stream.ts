import {Connection} from './connection';
import {Bignum} from './bignum';
import { EndpointType } from './endpoint.type';
import { TransportParameterType } from '../crypto/transport.parameters';
import { FlowControlledObject } from './flow.controlled';



export class Stream extends FlowControlledObject{
	
	private streamID: Bignum;
	
    public constructor(connection: Connection, streamID: Bignum) {
		super();
        super.init(connection);
		this.streamID = streamID;
    }

	public getStreamID(): Bignum {
		return this.streamID;
	}

	public setStreamID(value: Bignum) {
		this.streamID = value;
	}
}