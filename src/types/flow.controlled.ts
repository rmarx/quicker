import {Connection} from './connection';
import {EndpointType} from './endpoint.type';
import {TransportParameterType} from '../crypto/transport.parameters';
import {Bignum} from './bignum';

export abstract class FlowControlledObject {

	private localOffset: Bignum;
	private remoteOffset: Bignum;
	private localMaxData: Bignum;
    private remoteMaxData: Bignum;

    public constructor() {
        //
    }

    protected init(connection: Connection) {
		this.localOffset = Bignum.fromNumber(0);
		this.remoteOffset = Bignum.fromNumber(0);
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

	public setRemoteMaxData(maxData: Bignum) {
		this.remoteMaxData = maxData;
	}

	public getRemoteMaxData(): Bignum {
		return this.remoteMaxData;
	}

	public setLocalMaxData(maxData: Bignum) {
		this.localMaxData = maxData;
	}

	public getLocalMaxata(): Bignum {
		return this.localMaxData;
	}

    public isLocalLimitExceeded(): boolean {
		return this.isLimitExeeded(this.localMaxData, this.remoteOffset);
	}

    public isRemoteLimitExceeded(): boolean {
		return this.isLimitExeeded(this.remoteMaxData, this.remoteOffset);
	}

	private isLimitExeeded(maxData: Bignum, offset: Bignum): boolean {
		return offset.greaterThanOrEqual(maxData);
	}

    public isLocalLimitAlmostExceeded(): boolean {
		return this.isLimitAlmostExceeded(this.localMaxData, this.remoteOffset);
	}

    public isRemoteLimitAlmostExceeded(added: any): boolean {
		return this.isLimitAlmostExceeded(this.remoteMaxData, this.remoteOffset);
	}

	private isLimitAlmostExceeded(maxData: Bignum, offset: Bignum): boolean {
		var perc = maxData.divide(10);
		var temp = offset.add(perc);
		return temp.greaterThanOrEqual(maxData);
	}

}