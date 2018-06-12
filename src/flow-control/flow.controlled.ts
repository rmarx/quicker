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

    public constructor() {
		super();
        this.isRemoteBlocked = false;
		this.localOffset = new Bignum(0);
		this.remoteOffset = new Bignum(0);
	}
	
    public getLocalOffset(): Bignum {
		return this.localOffset;
	}

	public getRemoteOffset(): Bignum {
		return this.remoteOffset;
	}

	public addLocalOffset(offset: number): void;
	public addLocalOffset(offset: Bignum): void;
	public addLocalOffset(offset: any): void {
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
		var temp = this.localOffset.add(added);
		return this.isLimitExeeded(this.localMaxData, temp);
	}

    public isRemoteLimitExceeded(added: any = new Bignum(0)): boolean {
		var temp = this.remoteOffset.add(added);
		return this.isLimitExeeded(this.remoteMaxData, temp);
	}

	private isLimitExeeded(maxData: Bignum, offset: Bignum): boolean {
		return offset.greaterThanOrEqual(maxData);
	}

    public isLocalLimitAlmostExceeded(added: any = new Bignum(0)): boolean {
		var temp = this.localOffset.add(added);
		return this.isLimitAlmostExceeded(this.localMaxData, temp);
	}

    public isRemoteLimitAlmostExceeded(added: any = new Bignum(0)): boolean {
		var temp = this.remoteOffset.add(added);
		return this.isLimitAlmostExceeded(this.remoteMaxData, temp);
	}

	private isLimitAlmostExceeded(maxData: Bignum, offset: Bignum): boolean {
		var perc = maxData.divide(5);
		var temp = offset.add(perc);
		return temp.greaterThanOrEqual(maxData);
	}

	/**
	 * Used for version negotiation packet received
	 */
	public resetOffsets(): void {
		this.localOffset = new Bignum(0);
		this.remoteOffset = new Bignum(0);
	}

}