import { BitOperation } from "./../../helpers/bit.operation";
import { BasePacket } from "../base.packet";
import { BaseHeader, ConnectionID, PacketNumber } from "./base.header";
import { LongHeader, Version } from "./long.header";
import { ShortHeader } from "./short.header";


export class HeaderParser {

    public parse(buf: Buffer): BaseHeader {
        var type = buf.readUIntBE(0, 1);
        if(BitOperation.isBitSet(type, 8)) {
            return this.parseLongHeader(buf);
        }
        return this.parseShortHeader(buf);
    }

    private parseLongHeader(buf: Buffer): BaseHeader {
        var type = (buf.readUIntBE(0, 1) - 128);
        var connectionId = new ConnectionID(buf.slice(1, 9));
        var packetNumber = new PacketNumber(buf.slice(9, 13), 4);
        var version = new Version(buf.slice(13, 17));

        return new LongHeader(type, connectionId, packetNumber, version);
    }

    private parseShortHeader(buf: Buffer): BaseHeader {
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

        return new ShortHeader(type, connectionId, packetNumber, connectionIdOmitted, keyPhaseBit);
    }

    private correctShortHeaderType(type: number, connectionIdOmitted: boolean, keyPhaseBit: boolean) {
        if(!connectionIdOmitted) {
            type = type - 64;
        }
        if(keyPhaseBit) {
            type = type - 32;
        }
        return type;
    }

    private getShortHeaderPacketNumber(type: number, buffer: Buffer, offset: number) {
        var size = 1 << (type - 1);
        return new PacketNumber(buffer.slice(offset, offset + size), size);
    }
}