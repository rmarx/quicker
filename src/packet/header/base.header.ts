import { fromBuffer } from "bignum";
import { Bignum } from "../../utilities/bignum";

export abstract class BaseHeader {

    private headerType: HeaderType;
    private packetType: number;
    // ConnectionID can be null when connectionID is omitted by the omit_transport_connection_id parameter
    private connectionID?: ConnectionID;
    private packetNumber: PacketNumber;

    public constructor(headerType: HeaderType, type: number, connectionID: (ConnectionID | undefined), packetNumber: PacketNumber) {
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

    public getConnectionID(): ConnectionID | undefined {
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

    public constructor(buffer: Buffer, byteSize = 4) {
        this.property = new Bignum(buffer, byteSize);
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

    public constructor(buffer: Buffer) {
        super(buffer, 8);
    }

    public getConnectionID(): Bignum {
        return this.getProperty();
    }

    public setConnectionID(bignum: Bignum) {
        this.setProperty(bignum);
    }

    public static randomConnectionID(): ConnectionID {
        var randomBignum = Bignum.random('00', 'ffffffffffffffff', 8);
        return new ConnectionID(randomBignum.toBuffer());
    }
}

export class PacketNumber extends BaseProperty {

    public constructor(buffer: Buffer) {
        super(buffer, 8);
    }

    public getPacketNumber(): Bignum {
        return this.getProperty();
    }

    public setPacketNumber(bignum: Bignum) {
        this.setProperty(bignum);
    }

    public getMostSignificantBits(size: number = 4): Buffer {
        size = size > 8 ? 8 : size;
        var buf = Buffer.alloc(size);
        this.getProperty().toBuffer().copy(buf, 0, 0, size);
        return buf;
    }

    public getLeastSignificantBits(size: number = 4): Buffer {
        size = size > 8 ? 8 : size;
        var buf = Buffer.alloc(size);
        this.getProperty().toBuffer().copy(buf, 0, 8 - size, 8);
        return buf;
    }

    public static randomPacketNumber(): PacketNumber {
        var randomBignum = Bignum.random('00000000','fffffc00', 8);
        return new PacketNumber(randomBignum.toBuffer());
    }
}