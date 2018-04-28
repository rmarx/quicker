import { Bignum } from "../../types/bignum";
import {ConnectionID, PacketNumber, Version} from './header.properties';
import { ConnectionErrorCodes } from "../../utilities/errors/quic.codes";
import { QuicError } from "../../utilities/errors/connection.error";

export abstract class BaseHeader {

    private headerType: HeaderType;
    private packetType: number;
    private packetNumber!: PacketNumber;
    private parsedBuffer!: Buffer;

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

    public getParsedBuffer(): Buffer {
        if (this.parsedBuffer === undefined) {
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR);
        }
        return this.parsedBuffer;
    }

    public setParsedBuffer(parsedBuffer: Buffer): void {
        this.parsedBuffer = parsedBuffer;
    }
}

export enum HeaderType {
    LongHeader,
    ShortHeader
}