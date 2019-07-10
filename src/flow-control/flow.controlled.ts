import {EndpointType} from '../types/endpoint.type';
import {TransportParameterId} from '../crypto/transport.parameters';
import {Bignum} from '../types/bignum';
import { EventEmitter } from 'events';
import { logMethod } from '../utilities/decorators/log.decorator';


// REFACTOR TODO: use composition instead of inheritance for FlowControlledObject... 
export abstract class FlowControlledObject extends EventEmitter {

	private localOffset!: Bignum; // RECEIVE offset
	private remoteOffset!: Bignum; // SEND offset 
	private receiveAllowance!: Bignum;	// how much we are willing to RECEIVE from our peer
	private sendAllowance!: Bignum; // how much we are able to SEND to our peer 
	
	private isRemoteBlocked: boolean; // our peer is blocked on this stream, expects a MAX_STREAM_DATA update from us (i.e., their sendAllowance is reached)
	
	private readonly MAX_BUFFER_SIZE: number;
	private currentBufferSize: number;

    public constructor(bufferSize: number) {
		super();
		this.MAX_BUFFER_SIZE = bufferSize;
		this.currentBufferSize = 0;
		this.isRemoteBlocked = false;
		
		this.localOffset = new Bignum(0);
		this.remoteOffset = new Bignum(0);

		this.sendAllowance = new Bignum(0);
		this.receiveAllowance = new Bignum(0);
	}
	
    public getLocalOffset(): Bignum {
		return this.localOffset;
	}

	public getRemoteOffset(): Bignum {
		return this.remoteOffset; 
	}

	protected incrementBufferSizeUsed(dataLength: number): void {
		this.currentBufferSize += dataLength;
		this.emit(FlowControlledObjectEvents.INCREMENT_BUFFER_DATA_USED, dataLength);
    }

    protected decrementBufferSizeUsed(dataLength: number): void {
		this.currentBufferSize -= dataLength;
		this.emit(FlowControlledObjectEvents.DECREMENT_BUFFER_DATA_USED, dataLength);
	}

	public addLocalOffset(offset: number): void;
	public addLocalOffset(offset: Bignum): void;
	public addLocalOffset(offset: any) {
		this.localOffset = this.localOffset.add(offset);
	}

	public addRemoteOffset(offset: number): void;
	public addRemoteOffset(offset: Bignum): void;
	public addRemoteOffset(offset: any) {
		this.remoteOffset = this.remoteOffset.add(offset);
	}

	// "RemoteMaxData"
	public setSendAllowance(maxData: number): void;
	public setSendAllowance(maxData: Bignum): void;
	public setSendAllowance(maxData: any): void {
		if (maxData instanceof Bignum) {
			this.sendAllowance = maxData;
			return;
		}
		this.sendAllowance = new Bignum(maxData);
	}

	public getSendAllowance(): Bignum {
		return this.sendAllowance;
	}

	// "LocalMaxData"
	public setReceiveAllowance(maxData: number): void;
	public setReceiveAllowance(maxData: Bignum): void;
	public setReceiveAllowance(maxData: any): void {
		if (maxData instanceof Bignum) {
			this.receiveAllowance = maxData;
			return;
		}
		this.receiveAllowance = new Bignum(maxData);
	}

	public getReceiveAllowance(): Bignum {
		return this.receiveAllowance;
	}


    public isPeerAlmostBlocked(added: any = new Bignum(0)): boolean {
		var temp = this.localOffset.add(added).add(this.MAX_BUFFER_SIZE / 10);
		return this.receiveAllowance.lessThan(temp);
	}

	// when we receive a STREAM_BLOCKED frame from the peer
	// is supposed to stay true until we send a MAX_STREAM_DATA update
	public setPeerBlocked(blocked: boolean): void {
		this.isRemoteBlocked = blocked;
	}

	public isPeerBlocked(): boolean {
		return this.isRemoteBlocked;
	}

	// if not, we need to send a STREAM_BLOCKED frame to our peer 
    public ableToSend(added: any = new Bignum(0)): boolean {
		var temp = this.remoteOffset.add(added);
		return this.sendAllowance.lessThanOrEqual(temp);
	}


	public increaseReceiveAllowance(): Bignum {
		var updatedLocalMaxData = this.getLocalOffset().add(this.getBufferSpaceAvailable());
		// If test should not be necessary, it is just a precaution to be sure that we do not make the max data smaller, which is not allowed by QUIC
		if (updatedLocalMaxData.greaterThan(this.getReceiveAllowance())) {
			this.setReceiveAllowance(updatedLocalMaxData);
		}
		return this.getReceiveAllowance();
	}

	public getBufferSpaceAvailable(): number {
		return this.MAX_BUFFER_SIZE - this.currentBufferSize;
	}

	public getBufferSpaceUsed(): number {
		return this.currentBufferSize;
	}

	public getTotalBufferSpace(): number {
		return this.MAX_BUFFER_SIZE;
	}

	/**
	 * Used for version negotiation packet received
	 */
	public resetOffsets(): void {
		this.localOffset = new Bignum(0);
		this.remoteOffset = new Bignum(0);
	}
}


export enum FlowControlledObjectEvents {
	INCREMENT_BUFFER_DATA_USED = "fco-increment-used",
	DECREMENT_BUFFER_DATA_USED = "fco-decrement-used"
}