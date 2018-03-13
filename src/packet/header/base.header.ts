import { Bignum } from "../../types/bignum";
import {ConnectionID, PacketNumber, Version} from './header.properties';

export abstract class BaseHeader {

    private headerType: HeaderType;
    private packetType: number;
    // ConnectionID can be null when connectionID is omitted by the omit_transport_connection_id parameter
    private connectionID!: ConnectionID;
    private packetNumber!: PacketNumber;

    public constructor(headerType: HeaderType, type: number, connectionID: (ConnectionID | undefined), packetNumber: (PacketNumber | undefined)) {
        this.headerType = headerType;
        this.packetType = type;
        if (connectionID !== undefined) {
            this.connectionID = connectionID;
        }
        if (packetNumber !== undefined) {
            this.packetNumber = packetNumber;
        }
    }

    abstract toBuffer(): Buffer;
    abstract getPacketNumberSize(): number;

    public getPacketType(): number {
        return this.packetType;
    }

    public setPacketType(type: number) {
        this.packetType = type;
    }

    public getConnectionID(): ConnectionID {
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