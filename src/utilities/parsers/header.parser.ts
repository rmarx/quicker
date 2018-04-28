import { BasePacket } from "../../packet/base.packet";
import { BaseHeader, HeaderType } from "../../packet/header/base.header";
import { LongHeader } from "../../packet/header/long.header";
import { ShortHeader, ShortHeaderType } from "../../packet/header/short.header";
import { Constants } from "../constants";
import { ConnectionID, PacketNumber, Version } from '../../packet/header/header.properties';
import { QuicError } from "../errors/connection.error";
import { ConnectionErrorCodes } from "../errors/quic.codes";
import { VLIE } from "../../crypto/vlie";
import { Bignum } from "../../types/bignum";


export class HeaderParser {

    /**
     * Method to parse the header of a packet
     * returns a ShortHeader or LongHeader, depending on the first bit
     * @param buf packet buffer
     */
    public parse(buf: Buffer): HeaderOffset[] {
        var headerOffsets: HeaderOffset[] = [];
        var headerOffset: HeaderOffset = this.parseHeader(buf, 0);
        headerOffsets.push(headerOffset);
        var totalSize: Bignum = new Bignum(0);
        while (headerOffset.header.getHeaderType() === HeaderType.LongHeader) {
            var longHeader: LongHeader = <LongHeader>(headerOffset.header);
            var payloadLength = longHeader.getPayloadLength();
            var headerSize = new Bignum(headerOffset.offset).subtract(totalSize);
            if (payloadLength !== undefined) {
                totalSize = totalSize.add(payloadLength).add(headerSize);
            }
            if (totalSize.lessThan(buf.byteLength)) {
                headerOffset = this.parseHeader(buf, totalSize.toNumber());
                headerOffsets.push(headerOffset);
            } else {
                break;
            }
        }
        return headerOffsets;
    }

    private parseHeader(buf: Buffer, offset: number): HeaderOffset {
        var type = buf.readUIntBE(offset, 1);
        if ((type & 0x80) === 0x80) {
            return this.parseLongHeader(buf, offset);
        }
        return this.parseShortHeader(buf, offset);
    }

    /**
     *  Method to parse the Long header of a packet
     * 
     * @param buf packet buffer
     */
    private parseLongHeader(buf: Buffer, offset: number): HeaderOffset {
        var startOffset = offset;
        var type = (buf.readUInt8(offset++) - 0x80);
        var version = new Version(buf.slice(offset, offset + 4));
        offset += 4;
        var conLengths = buf.readUInt8(offset++);
        var destLength = conLengths >> 4;
        destLength = destLength === 0 ? destLength : destLength + 3;
        var srcLength = conLengths & 0xF;
        srcLength = srcLength === 0 ? srcLength : srcLength + 3;

        var destConnectionID = new ConnectionID(buf.slice(offset, offset + destLength), destLength);
        offset += destLength;
        var srcConnectionID = new ConnectionID(buf.slice(offset, offset + srcLength), srcLength);
        offset += srcLength;

        // packetnumber is actually 64-bit but on the wire, it is only 32-bit
        var packetNumber;
        var payloadLength;
        if (version.toString() !== "00000000") {
            var vlieOffset = VLIE.decode(buf, offset);
            payloadLength = vlieOffset.value;
            offset = vlieOffset.offset;
            packetNumber = new PacketNumber(buf.slice(offset, offset + 4));
            offset += 4;
        }
        var header = new LongHeader(type, destConnectionID, srcConnectionID, packetNumber, payloadLength, version);
        var parsedBuffer = buf.slice(startOffset, offset);
        header.setParsedBuffer(parsedBuffer);
        
        return { header: header, offset: offset };
    }

    /**
     *  Method to parse the short header of a packet
     * 
     * @param buf packet buffer
     */
    private parseShortHeader(buf: Buffer, offset: number): HeaderOffset {
        var startOffset = offset;
        var type = buf.readUIntBE(offset++, 1);
        var keyPhaseBit: boolean = (type & 0x40) === 0x40;
        var thirdBitCheck: boolean = (type & 0x20) === 0x20;
        var fourthBitCheck: boolean = (type & 0x10) === 0x10;
        var fifthBitCheck: boolean = (type & 0x08) === 0x08;
        var spinBit: boolean = (type & 0x04) === 0x04;
        /*if (!thirdBitCheck || !fourthBitCheck || fifthBitCheck) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION)
        }*/

        type = this.correctShortHeaderType(type);

        var destLen = buf.readUInt8(offset);
        var destConIDBuffer = Buffer.alloc(destLen);
        buf.copy(destConIDBuffer, 0, offset, offset + destLen);
        var destConnectionID = new ConnectionID(destConIDBuffer, destLen);
        offset += destLen;

        var packetNumber = this.getShortHeaderPacketNumber(type, buf, offset)
        offset = offset + (1 << type);

        var header = new ShortHeader(type, destConnectionID, packetNumber, keyPhaseBit, spinBit)
        var parsedBuffer = buf.slice(startOffset, offset);
        header.setParsedBuffer(parsedBuffer);

        return { header: header, offset: offset };
    }

    /**
     *  subtracts first five bits from type if they are set.
     *  value of returned type is needed to get the size of the packet number
     * 
     * @param type 
     */
    private correctShortHeaderType(type: number): number {
        return type & 0x3;
    }

    /**
     * Get the packet number from the buffer by getting the size of the packet number field 
     *   from the short header type field
     * @param type type field of the header
     * @param buffer packet buffer
     * @param offset start offset of the buffer to get the packet number
     */
    private getShortHeaderPacketNumber(type: number, buffer: Buffer, offset: number): PacketNumber {
        switch (type) {
            case ShortHeaderType.OneOctet:
                return new PacketNumber(buffer.slice(offset, offset + 1));
            case ShortHeaderType.TwoOctet:
                return new PacketNumber(buffer.slice(offset, offset + 2));
            case ShortHeaderType.FourOctet:
                return new PacketNumber(buffer.slice(offset, offset + 4));
            default:
                throw Error("Not a valid packet type");
        }
    }
}
/**
 * Interface so that the offset of the buffer is also returned because it is variable in a shortheader
 */
export interface HeaderOffset {
    header: BaseHeader,
    offset: number
}