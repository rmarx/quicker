import { fromBuffer } from "bignum";

export abstract class BaseHeader {

    private headerType: HeaderType;
    // ConnectionID can be null when connectionID is omitted by the omit_transport_connection_id parameter
    private packetType: number;
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
    /**
     * TODO change to bignum
     */
    private propertyBuffer: Buffer;

    public constructor(buffer: Buffer) {
        this.setProperty(buffer);
    }

    protected getProperty(): Buffer {
        return this.propertyBuffer;
    }

    protected setProperty(buffer: Buffer) {
        this.propertyBuffer = Buffer.alloc(buffer.length);
        buffer.copy(this.propertyBuffer);
    }

    public toString(): string {
        return this.propertyBuffer.toString("hex");
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

    public getConnectionID(): Buffer {
        return this.getProperty();
    }

    public setConnectionID(buffer: Buffer) {
        this.setProperty(buffer);
    }
}

export class PacketNumber extends BaseProperty {

    private length: number;

    public constructor(buffer: Buffer, length: number) {
        // Buffer need to be length 1,2 or 4 given by the length variable
        if (buffer.length !== length) {
            // TODO: throw error
            return;
        }
        super(buffer);
    }

    public getPacketNumber(): Buffer {
        return this.getProperty();
    }

    public setPacketNumber(buffer: Buffer, length: number) {
        // Buffer need to be length 1,2 or 4 given by the length variable
        if (buffer.length !== length) {
            // TODO: throw error
            return;
        }
        this.setProperty(buffer);
    }

    public getLength(): number {
        return this.length;
    }
}