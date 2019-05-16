import { Bignum } from '../types/bignum';
import { EndpointType } from '../types/endpoint.type';
import { TransportParameterId } from '../crypto/transport.parameters';
import { FlowControlledObject } from '../flow-control/flow.controlled';
import { QuicError } from '../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { Constants } from '../utilities/constants';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { EventEmitter } from 'events';
import { EncryptionLevel } from './crypto.context';

// CryptoStream is the forbidden lovechild of Stream and FlowControlledObject
// This is because CryptoStream is quite similar to those to, but also not really, and much simpler, so a separate class makes things easier
export class CryptoStream extends EventEmitter {
    
    private cryptoLevel!:EncryptionLevel; // not really necessary, but useful for debugging

	private localFinalOffset!: Bignum;
	private remoteFinalOffset!: Bignum;
	private dataToSend: Buffer; // data we wish to send to the receiver
	private bufferedData: { [key: string]: Buffer }; // received data with an offset "in the future" that we need to keep but cannot propagate yet because earlier data hasn't arrived

    private localOffset!: Bignum; // amount of data we have RECEIVED and actually propagated up
	private remoteOffset!: Bignum; // amount of data we have SENT (what we think the remote's offset should be after receiving our packets)
	
    public constructor(cryptoLevel:EncryptionLevel) {
        super();

        this.cryptoLevel = cryptoLevel;
        
		this.dataToSend = Buffer.alloc(0);
        this.bufferedData = {};
        
		this.localOffset = new Bignum(0);
		this.remoteOffset = new Bignum(0);
	}
	
	public getCryptoLevel():EncryptionLevel{
		return this.cryptoLevel;
	}

    // --------------------------------------------
    // SEND logic
    // --------------------------------------------

	public addData(data: Buffer): void {
		this.dataToSend = Buffer.concat([this.dataToSend, data]);
    }
    

    // gets a copy of the data without removing it from the buffer
    // if you want to actually remove it, use popData
	public peekData(size: number = this.dataToSend.byteLength): Buffer {
		var buf = Buffer.alloc(size);
		this.dataToSend.copy(buf, 0, 0, size);
		return buf;
	}

	public popData(size: number = this.dataToSend.byteLength): Buffer {
		var buf = this.dataToSend.slice(0, size);
		this.dataToSend = this.dataToSend.slice(size);
		return buf;
	}

	public getOutgoingDataSize(): number {
		return this.dataToSend.byteLength;
    }
    
    // Has to be set from the outside when we actually wrap this up into Crypto frames (depends on how much size there is in the packets)
    // Primarily acts as statekeeping here, data-buffer is sliced when sending anyway, so we don't use this to determine offset into the data buffer for sending
	public addRemoteOffset(offset: number): void;
	public addRemoteOffset(offset: Bignum): void;
	public addRemoteOffset(offset: any) {
		this.remoteOffset = this.remoteOffset.add(offset);
    }

	public getRemoteOffset(): Bignum {
		return this.remoteOffset;
    }


    // --------------------------------------------
    // RECEIVE logic
    // --------------------------------------------

    public getLocalOffset(): Bignum {
		return this.localOffset;
	}
    
    private addLocalOffset(offset: number): void;
	private addLocalOffset(offset: Bignum): void;
	private addLocalOffset(offset: any) {
		this.localOffset = this.localOffset.add(offset);
    }
    

	public receiveData(data: Buffer, offset: Bignum): void {
		if (offset.equals(this.getLocalOffset())) {
			this._receiveData(data);
			this.checkBufferedData(); // see if we've received data after this one (in case of packet re-ordering)
        } 
        else if (offset.greaterThan(this.getLocalOffset())) { // re-ordered packet, need to wait for the previous data, buffer this for later
			this.addBufferedData(data, offset);
        } 
        else {
			// Offset is smaller than local offset
            // --> data is already received by the application, thus ignore data.
            VerboseLogging.info("CryptoStream:receiveData: received data with too small an offset, probably duplicate, ignoring!" + offset.toNumber() + " < " + this.getLocalOffset() );
		}
	}

	private _receiveData(data: Buffer): void {
        this.addLocalOffset(data.byteLength);
         // we do not buffer the usable data here, we expect listeners to process it immediately
		this.emit(CryptoStreamEvent.DATA, data);
	}


    // see if we have data buffered that became useful because of the receipt of earlier data that "fills the gap"
	private checkBufferedData(): void {
		var data = this.popBufferedData(this.getLocalOffset());
		while (data !== undefined) {
			this._receiveData(data);
			data = this.popBufferedData(this.getLocalOffset());
		}
	}

    private popBufferedData(localOffset: Bignum): Buffer | undefined {
		var offsetString: string = localOffset.toDecimalString();
        if (this.bufferedData[offsetString] !== undefined) {
			var bufferedData = this.bufferedData[offsetString];
			delete this.bufferedData[offsetString];
            return bufferedData;
        }
        return undefined;
    }

    private addBufferedData(data: Buffer, offset: Bignum): void {
		var offsetString: string = offset.toDecimalString();
        if (this.bufferedData[offsetString] === undefined) {
            this.bufferedData[offsetString] = data;
        }
	}

	public resetOffsets():void {
		this.localOffset = new Bignum(0);
		this.remoteOffset = new Bignum(0);
	}
}

export enum CryptoStreamEvent {
	DATA = "crypto-stream-data"
} 