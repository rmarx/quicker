
export abstract class BaseHeader {

    // ConnectionID can be null when connectionID is omitted by the omit_transport_connection_id parameter
    private type: number;
    private connectionID?: ConnectionID;
    private packetNumber: PacketNumber;

    public constructor(type: number, connectionID: (ConnectionID | undefined) ,packetNumber: PacketNumber) {
        this.type = type;
        this.connectionID = connectionID;
        this.packetNumber = packetNumber;
    }

    public getType(): number {
        return this.type;
    }

    public setType(type: number) {
        this.type = type;
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
}


export class BaseProperty {
    /**
     * Keep buffer of the connectionID so it can be used directly when building a new packet
     */
    private propertyBuffer: Buffer;

    public constructor(buffer: Buffer) {
        this.propertyBuffer = buffer;
    }

    protected getProperty(): Buffer {
        return this.propertyBuffer;
    }

    protected setProperty(buffer: Buffer) {
        this.propertyBuffer = buffer;
    }

    public toString(): string {
        return this.propertyBuffer.toString("hex");
    }
}

export class ConnectionID extends BaseProperty {

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