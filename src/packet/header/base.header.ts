import { Bignum } from "../../types/bignum";
import {ConnectionID, PacketNumber, Version} from './header.properties';

export abstract class BaseHeader {

    private headerType: HeaderType;
    private packetType: number;
    private packetNumber!: PacketNumber;

    public constructor(headerType: HeaderType, type: number, packetNumber: (PacketNumber | undefined)) {
        this.headerType = headerType;
        this.packetType = type;
        if (packetNumber !== undefined) {
            this.packetNumber = packetNumber;
        }
    }

    abstract toBuffer(): Buffer;
    abstract getPacketNumberSize(): number;
    abstract getSize(): number;

    public getPacketType(): number {
        return this.packetType;
    }

    public setPacketType(type: number) {
        this.packetType = type;
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