import { Bignum } from "../../types/bignum";
import {ConnectionID, PacketNumber, Version} from './header.properties';
import { ConnectionErrorCodes } from "../../utilities/errors/quic.codes";
import { QuicError } from "../../utilities/errors/connection.error";
import { Connection } from "../../quicker/connection";
import { VLIE } from "../../types/vlie";
import { Constants } from "../../utilities/constants";
import { VerboseLogging } from "../../utilities/logging/verbose.logging";

// QUIC defines two types of header formats: Long and Short
// https://tools.ietf.org/html/draft-ietf-quic-transport#section-4
// This is mainly to reduce the size overhead of the headers
// - Long: used during connection setup (we don't know the exact settings we will use yet, have to be present in the headers)
// - Short: used afterwards (both client and server know the agreed upon settings, no need to keep sending them in each packet)
export enum HeaderType {
    LongHeader,
    ShortHeader,
    VersionNegotiationHeader
}

/** BaseHeader : defines the shared fields between Long and Short headers */
export abstract class BaseHeader {

    private headerType: HeaderType;
    private packetType: number;
    private packetNumber: PacketNumber | undefined;
    protected truncatedPacketNumber: PacketNumber | undefined;
    //private parsedBuffer!: Buffer;

    public constructor(headerType: HeaderType, type: number) {
        this.headerType = headerType;
        this.packetType = type;
        this.packetNumber = undefined;
        this.truncatedPacketNumber = undefined;
    }

    abstract toUnencryptedBuffer(): Buffer;
    //abstract toHeaderProtectedBuffer(connection: Connection, headerAndEncryptedPayload: Buffer): Buffer;
    
    abstract getSize(): number;

    public getPacketType(): number {
        return this.packetType;
    }

    public setPacketType(type: number) {
        this.packetType = type;
    }

    public getPacketNumber(): PacketNumber | undefined {
        return this.packetNumber;
    }

    public setPacketNumber(fullPacketNumber: PacketNumber, largestAcknowledgedPacketNumber: PacketNumber):void {
        this.packetNumber = fullPacketNumber;
        this.truncatedPacketNumber = fullPacketNumber.truncate( largestAcknowledgedPacketNumber );

        VerboseLogging.info("BaseHeader:setPacketNumber: " + fullPacketNumber.getValue().toDecimalString() + " // " + this.truncatedPacketNumber!.getValue().toDecimalString() + "@ " + this.truncatedPacketNumber!.getValue().getByteLength() );
    }

    public getTruncatedPacketNumber(): PacketNumber | undefined {
        return this.truncatedPacketNumber;
    }

    public setTruncatedPacketNumber(truncatedPacketNumber: PacketNumber, largestAcknowledgedPacketNumber: PacketNumber):void {
        this.truncatedPacketNumber = truncatedPacketNumber;
        this.packetNumber = truncatedPacketNumber.restoreFromTruncate( largestAcknowledgedPacketNumber );

        VerboseLogging.info("BaseHeader:setTruncatedPacketNumber: " + truncatedPacketNumber.getValue().toDecimalString() + " // " + this.packetNumber!.getValue().toDecimalString() + "@ " + this.packetNumber!.getValue().getByteLength() );
    }

    public getHeaderType() {
        return this.headerType;
    }

    // public getParsedBuffer(): Buffer {
    //     if (this.parsedBuffer === undefined) {
    //         throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR);
    //     }
    //     return this.parsedBuffer;
    // }

    // public setParsedBuffer(parsedBuffer: Buffer): void {
    //     this.parsedBuffer = parsedBuffer;
    // }
}