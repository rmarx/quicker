import { BasePacket } from "../../packet/base.packet";
import { BaseHeader } from "../../packet/header/base.header";
import { LongHeader } from "../../packet/header/long.header";
import { ShortHeader, ShortHeaderType } from "../../packet/header/short.header";
import { Constants } from "../constants";
import {ConnectionID, PacketNumber, Version} from '../../packet/header/header.properties';


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
        var type = (buf.readUIntBE(0, 1) - 0x80);
        var connectionId = new ConnectionID(buf.slice(1, 9));
        var version = new Version(buf.slice(9, 13));
        // packetnumber is actually 64-bit but on the wire, it is only 32-bit
        var packetNumber;
        if (version.toString() !== "00000000") {
            packetNumber = new PacketNumber(buf.slice(13, 17));
        }

        return { header: new LongHeader(type, connectionId, packetNumber, version), offset: Constants.LONG_HEADER_SIZE };
    }

    /**
     *  Method to parse the short header of a packet
     * 
     * @param buf packet buffer
     */
    private parseShortHeader(buf: Buffer): HeaderOffset {
        var offset = 1;
        var type = buf.readUIntBE(0, 1);
        var connectionIdOmitted: boolean = (type & 0x40) === 0x40;
        var keyPhaseBit = (type & 0x20) === 0x20;
        var connectionId = undefined;

        type = this.correctShortHeaderType(type, connectionIdOmitted, keyPhaseBit);
        if (!connectionIdOmitted) {
            connectionId = new ConnectionID(buf.slice(offset, offset + 8));
            offset = offset + 8;
        }
        var packetNumber = this.getShortHeaderPacketNumber(type, buf, offset)
        offset = offset + (1 << (0x1f - type));
        return { header: new ShortHeader(type, connectionId, packetNumber, connectionIdOmitted, keyPhaseBit), offset: offset };
    }

    /**
     *  subtracts C and K bit from type if they are set.
     *  value of returned type is needed to get the size of the packet number
     * 
     * @param type 
     * @param connectionIdOmitted 
     * @param keyPhaseBit 
     */
    private correctShortHeaderType(type: number, connectionIdOmitted: boolean, keyPhaseBit: boolean): number {
        return type & 0x1f;
    }

    /**
     * Get the packet number from the buffer by getting the size of the packet number field 
     *   from the short header type field:
     * 
     * TODO: still needs decoding of the packet number
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