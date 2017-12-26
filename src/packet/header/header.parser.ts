import { BitOperation } from "./../../utilities/bit.operation";
import { BasePacket } from "../base.packet";
import { BaseHeader, ConnectionID, PacketNumber } from "./base.header";
import { LongHeader, Version } from "./long.header";
import { ShortHeader, ShortHeaderType } from "./short.header";
import { Constants } from "../../utilities/constants";


export class HeaderParser {

    /**
     * Method to parse the header of a packet
     * returns a ShortHeader or LongHeader, depending on the first bit
     * @param buf packet buffer
     */
    public parse(buf: Buffer): HeaderOffset {
        var type = buf.readUIntBE(0, 1);
        if (BitOperation.isBitSet(type, 8)) {
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
        console.log("parsing long header");
        var type = (buf.readUIntBE(0, 1) - 0x80);
        var connectionId = new ConnectionID(buf.slice(1, 9));
        var version = new Version(buf.slice(9, 13));
        // packetnumber is actually 64-bit but on the wire, it is only 32-bit
        var packetNumber = new PacketNumber(buf.slice(13, 17));

        return { header: new LongHeader(type, connectionId, packetNumber, version), offset: Constants.LONG_HEADER_SIZE };
    }

    /**
     *  Method to parse the short header of a packet
     * 
     * @param buf packet buffer
     */
    private parseShortHeader(buf: Buffer): HeaderOffset {
        console.log("parsing short header");
        var offset = 1;
        var type = buf.readUIntBE(0, 1);
        var connectionIdOmitted = !(BitOperation.isBitSet(type, 7));
        var keyPhaseBit = BitOperation.isBitSet(type, 6);
        var connectionId = undefined;

        type = this.correctShortHeaderType(type, connectionIdOmitted, keyPhaseBit);
        if (!connectionIdOmitted) {
            connectionId = new ConnectionID(buf.slice(offset, offset + 8));
            offset = offset + 8;
        }
        var packetNumber = this.getShortHeaderPacketNumber(type, buf, offset)
        offset = offset + (1 << ((type - 0x20) * -1));
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
        if (!connectionIdOmitted) {
            type = type - 0x40;
        }
        if (keyPhaseBit) {
            type = type - 0x20;
        }
        return type;
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