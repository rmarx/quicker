import {Connection} from './connection';
import {EndpointType} from './endpoint.type';
import {TransportParameterType} from '../crypto/transport.parameters';
import {Bignum} from './bignum';

export abstract class FlowControlledObject {

	private localOffset: Bignum;
	private remoteOffset: Bignum;
	private localMaxStreamData: Bignum;
    private remoteMaxStreamData: Bignum;
    
    public constructor() {
        //
    }

    protected init(connection: Connection) {
		this.localOffset = Bignum.fromNumber(0);
		this.remoteOffset = Bignum.fromNumber(0);
        this.localOffset = connection.getLocalTransportParameter(TransportParameterType.MAX_STREAM_DATA);
        this.remoteOffset = connection.getRemoteTransportParameter(TransportParameterType.MAX_STREAM_DATA);
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

	public setRemoteMaxStreamData(maxStreamData: Bignum) {
		this.remoteMaxStreamData = maxStreamData;
	}

	public getRemoteMaxStreamData(): Bignum {
		return this.remoteMaxStreamData;
	}

	public setLocalMaxStreamData(maxStreamData: Bignum) {
		this.localMaxStreamData = maxStreamData;
	}

	public getLocalMaxStreamData(): Bignum {
		return this.localMaxStreamData;
	}

    public isLocalLimitExceeded(): boolean {
		return this.isLimitExeeded(this.remoteMaxStreamData, this.remoteOffset);
	}

    public isRemoteLimitExceeded(): boolean {
		return this.isLimitExeeded(this.remoteMaxStreamData, this.remoteOffset);
	}

	private isLimitExeeded(maxStreamData: Bignum, offset: Bignum): boolean {
		return offset.greaterThanOrEqual(maxStreamData);
	}

    public isLocalLimitAlmostExceeded(): boolean {
		return this.isLimitAlmostExceeded(this.remoteMaxStreamData, this.remoteOffset);
	}

    public isRemoteLimitAlmostExceeded(added: any): boolean {
		return this.isLimitAlmostExceeded(this.remoteMaxStreamData, this.remoteOffset);
	}

	private isLimitAlmostExceeded(maxStreamData: Bignum, offset: Bignum): boolean {
		var perc = maxStreamData.divide(10);
		var temp = offset.add(perc);
		return temp.greaterThanOrEqual(maxStreamData);
	}

}