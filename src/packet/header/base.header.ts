import { fromBuffer } from "bignum";
import { Bignum } from "../../utilities/bignum";

export abstract class BaseHeader {

    private headerType: HeaderType;
    private packetType: number;
    // ConnectionID can be null when connectionID is omitted by the omit_transport_connection_id parameter
    private connectionID?: ConnectionID;
    private packetNumber: PacketNumber;

    public constructor(headerType: HeaderType, type: number, connectionID: (ConnectionID | undefined) ,packetNumber: PacketNumber) {
        this.headerType = headerType;
        this.packetType = type;
        this.connectionID = connectionID;
        this.packetNumber = packetNumber;
    }

    abstract toBuffer(): Buffer;

    public getPacketType(): number {
        return this.packetType;
    }

    public setPacketType(type: number) {
        this.packetType = type;
    }

    public getConnectionID(): ConnectionID  |  undefined {
        return this.connectionID;
    }

    public setConnectionID(connectionId: ConnectionID) {
        this.connectionID = connectionId;
    }

    public getPacketNumber(): PacketNumber {
        return this.packetNumber;
    }

    public setPacketNumber(packetNumber: PacketNumber) {
        this.packetNumber = packetNumber;
    }

    public getHeaderType() {
        return this.headerType;
    }
}

export enum HeaderType {
    LongHeader,
    ShortHeader
}


export class BaseProperty {
    
    private property: Bignum;

    public constructor(buffer: Buffer) {
        this.property = new Bignum(buffer);
    }

    protected getProperty(): Bignum {
        return this.property;
    }

    protected setProperty(bignum: Bignum) {
        this.property = bignum;
    }

    public toBuffer(): Buffer {
        return this.property.toBuffer();
    }

    public toString(): string {
        return this.property.toString("hex");
    }
}

export class ConnectionID extends BaseProperty {

    private packetNumber: any;

    public constructor(buffer: Buffer) {
        // Buffer need to be length 8 because connection id is 64 bits long
        if (buffer.length !== 8) {
            // TODO: throw error
            return;
        }
        super(buffer);
    }

    public getConnectionID(): Bignum {
        return this.getProperty();
    }

    public setConnectionID(bignum: Bignum) {
        this.setProperty(bignum);
    }
}

export class PacketNumber extends BaseProperty {

    public constructor(buffer: Buffer, length: number) {
        // Buffer need to be length 1,2 or 4 given by the length variable
        if (buffer.length !== length) {
            // TODO: throw error
            return;
        }
        super(buffer);
    }

    public getPacketNumber(): Bignum {
        return this.getProperty();
    }

    public setPacketNumber(bignum: Bignum, length: number) {
        // Buffer need to be length 1,2 or 4 given by the length variable
        if (bignum.toBuffer().length !== length) {
            // TODO: throw error
            return;
        }
        this.setProperty(bignum);
    }
}