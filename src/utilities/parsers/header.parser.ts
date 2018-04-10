import { BasePacket } from "../../packet/base.packet";
import { BaseHeader } from "../../packet/header/base.header";
import { LongHeader } from "../../packet/header/long.header";
import { ShortHeader, ShortHeaderType } from "../../packet/header/short.header";
import { Constants } from "../constants";
import { ConnectionID, PacketNumber, Version } from '../../packet/header/header.properties';
import { QuicError } from "../errors/connection.error";
import { ConnectionErrorCodes } from "../errors/quic.codes";


export class HeaderParser {

    /**
     * Method to parse the header of a packet
     * returns a ShortHeader or LongHeader, depending on the first bit
     * @param buf packet buffer
     */
    public parse(buf: Buffer): HeaderOffset {
        var type = buf.readUIntBE(0, 1);
        if ((type & 0x80) === 0x80) {
            return this.parseLongHeader(buf);
        }
        return this.parseShortHeader(buf);
    }

    /**
     *  Method to parse the Long header of a packet
     * 
     * @param buf packet buffer
     */
    private parseLongHeader(buf: Buffer): HeaderOffset {
        var offset = 0;
        var type = (buf.readUInt8(offset++) - 0x80);
        var version = new Version(buf.slice(offset, offset + 4));
        offset += 4;
        var conLengths = buf.readUInt8(offset++);
        var destLength = conLengths >> 4;
        var srcLength = conLengths & 0xF;

        var destConnectionID = new ConnectionID(buf.slice(offset, offset + destLength), destLength);
        offset += destLength;
        var srcConnectionID = new ConnectionID(buf.slice(offset, offset + srcLength), srcLength);
        offset += srcLength;
        
        // packetnumber is actually 64-bit but on the wire, it is only 32-bit
        var packetNumber;
        if (version.toString() !== "00000000") {
            packetNumber = new PacketNumber(buf.slice(offset, offset + 4));
            offset += 4;
        }

        return { header: new LongHeader(type, destConnectionID, srcConnectionID, packetNumber, version), offset: offset };
    }

    /**
     *  Method to parse the short header of a packet
     * 
     * @param buf packet buffer
     */
    private parseShortHeader(buf: Buffer): HeaderOffset {
        var offset = 1;
        var type = buf.readUIntBE(0, 1);
        var keyPhaseBit: boolean = (type & 0x40) === 0x40;
        var thirdBitCheck = (type & 0x20) === 0x20;
        var fourthBitCheck = (type & 0x10) === 0x10;
        var fifthBitCheck = (type & 0x08) === 0x08;
        if (!thirdBitCheck || !fourthBitCheck || fifthBitCheck) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION)
        }

        type = this.correctShortHeaderType(type);

        var destLen = buf.readUInt32BE(offset);
        var destConIDBuffer = Buffer.alloc(length);
        buf.copy(destConIDBuffer, 0, offset, offset + length);
        var destConnectionID = new ConnectionID(buf, destLen);
        offset += destLen;

        var packetNumber = this.getShortHeaderPacketNumber(type, buf, offset)
        offset = offset + (1 << type);
        return { header: new ShortHeader(type, destConnectionID, packetNumber, keyPhaseBit), offset: offset };
    }

    /**
     *  subtracts first five bits from type if they are set.
     *  value of returned type is needed to get the size of the packet number
     * 
     * @param type 
     */
    private correctShortHeaderType(type: number): number {
        return type & 0x7;
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