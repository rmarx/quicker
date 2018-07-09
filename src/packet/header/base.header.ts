import { Bignum } from "../../types/bignum";
import {ConnectionID, PacketNumber, Version} from './header.properties';
import { ConnectionErrorCodes } from "../../utilities/errors/quic.codes";
import { QuicError } from "../../utilities/errors/connection.error";
import { Connection } from "../../quicker/connection";
import { VLIE } from "../../crypto/vlie";
import { Constants } from "../../utilities/constants";

// QUIC defines two types of header formats: Long and Short
// https://tools.ietf.org/html/draft-ietf-quic-transport#section-4
// This is mainly to reduce the size overhead of the headers
// - Long: used during connection setup (we don't know the exact settings we will use yet, have to be present in the headers)
// - Short: used afterwards (both client and server know the agreed upon settings, no need to keep sending them in each packet)
export enum HeaderType {
    LongHeader,
    ShortHeader
}

/** BaseHeader : defines the shared fields between Long and Short headers */
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
    abstract toPNEBuffer(connection: Connection, payload: Buffer): Buffer;
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


    public getPacketNumberSize(): number {
        if (this.packetNumber === undefined) {
            return 4;
        }
        return 2**VLIE.getBytesNeededPn(new Bignum(this.getPacketNumber().getLeastSignificantBytes()));
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