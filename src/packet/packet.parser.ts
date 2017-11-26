import { HeaderParser } from "./header/header.parser";
import { BasePacket } from "./base.packet";
import { HeaderType, BaseHeader } from "./header/base.header";
import { LongHeader, LongHeaderType } from "./header/long.header";


export class PacketParser {
    private headerParser: HeaderParser;

    public constructor() {
        this.headerParser = new HeaderParser();
    }

    public parse(msg: Buffer) {
        var headerOffset = this.headerParser.parse(msg);
        var header = headerOffset.header;
        if (header.getHeaderType() === HeaderType.LongHeader) {
            return this.parseLongHeaderPacket(header, msg)
        }
        return this.parseShortHeaderPacket(header, msg, headerOffset.offset);
    }

    private parseLongHeaderPacket(header: BaseHeader, buffer: Buffer): any {
        switch(header.getPacketType()) {
            case LongHeaderType.VersionNegotiation:
                // Version negotiation packet
                return undefined;
            case LongHeaderType.ClientInitial:
                // Client Initial
                return undefined;
            case LongHeaderType.ServerStatelessRetry:
                // Server Stateless Retry
                return undefined;
            case LongHeaderType.ServerCleartext:
                // Server cleartext
                return undefined;
            case LongHeaderType.ClientCleartext:
                // Client cleartext
                return undefined;
            case LongHeaderType.Protected0RTT:
                // 0-RTT Protected
                return undefined;
            default:
                // Unknown packet type
                return undefined;
        }
    }

    private parseShortHeaderPacket(header: BaseHeader, buffer: Buffer, offset: number): any {
        throw new Error("Method not implemented.");
    }
}