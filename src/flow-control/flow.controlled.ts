import {EndpointType} from '../types/endpoint.type';
import {TransportParameterType} from '../crypto/transport.parameters';
import {Bignum} from '../types/bignum';
import { EventEmitter } from 'events';
import { logMethod } from '../utilities/decorators/log.decorator';


// REFACTOR TODO: use composition instead of inheritance for FlowControlledObject... 
export abstract class FlowControlledObject extends EventEmitter {

	private localOffset!: Bignum;
	private remoteOffset!: Bignum;
	private localMaxData!: Bignum;
	private remoteMaxData!: Bignum;
	
	private isRemoteBlocked: boolean;
	
	private readonly MAX_BUFFER_SIZE: number;
	private currentBufferSize: number;

    public constructor(bufferSize: number) {
		super();
		this.MAX_BUFFER_SIZE = bufferSize;
		this.currentBufferSize = 0;
		this.isRemoteBlocked = false;
		
		this.localOffset = new Bignum(0);
		this.remoteOffset = new Bignum(0);

		this.remoteMaxData = new Bignum(0);
		this.localMaxData = new Bignum(0);
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

	public setRemoteMaxData(maxData: number): void;
	public setRemoteMaxData(maxData: Bignum): void;
	public setRemoteMaxData(maxData: any): void {
		if (maxData instanceof Bignum) {
			this.remoteMaxData = maxData;
			return;
		}
		this.remoteMaxData = new Bignum(maxData);
	}

	public getRemoteMaxData(): Bignum {
		return this.remoteMaxData;
	}

	public setLocalMaxData(maxData: number): void;
	public setLocalMaxData(maxData: Bignum): void;
	public setLocalMaxData(maxData: any): void {
		if (maxData instanceof Bignum) {
			this.localMaxData = maxData;
			return;
		}
		this.localMaxData = new Bignum(maxData);
	}

	public getIsRemoteBlocked(): boolean {
		return this.isRemoteBlocked;
	}

	public setIsRemoteBlocked(blocked: boolean): void {
		this.isRemoteBlocked = blocked;
	}

	public getLocalMaxData(): Bignum {
		return this.localMaxData;
	}

    public isLocalLimitExceeded(added: any = new Bignum(0)): boolean {
		return this.currentBufferSize > this.MAX_BUFFER_SIZE;
	}

    public isRemoteLimitExceeded(added: any = new Bignum(0)): boolean {
		var temp = this.remoteOffset.add(added);
		return this.remoteMaxData.lessThan(temp);
	}

    public isLocalLimitAlmostExceeded(added: any = new Bignum(0)): boolean {
		var temp = this.localOffset.add(added).add(this.MAX_BUFFER_SIZE / 10);
		return this.localMaxData.lessThan(temp);
	}

	public updateLocalMaxDataSpace(): Bignum {
		var updatedLocalMaxData = this.getLocalOffset().add(this.getBufferSpaceAvailable());
		// If test should not be necessary, it is just a precaution to be sure that we do not make the max data smaller, which is not allowed by QUIC
		if (updatedLocalMaxData.greaterThan(this.getLocalMaxData())) {
			this.setLocalMaxData(updatedLocalMaxData);
		}
		return this.getLocalMaxData();
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
	DECREMENT_BUFFER_DATA_USED = "fco_decrement-used"
}