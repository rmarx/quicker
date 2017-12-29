import {FrameParser} from '../frame/frame.parser';
import {AEAD} from '../crypto/aead';
import {Connection} from '../types/connection';
import {HeaderOffset} from './header/header.parser';
import {EndpointType} from '../types/endpoint.type';
import {HeaderType, BaseHeader} from './header/base.header';
import {LongHeader, LongHeaderType} from './header/long.header';
import {Version} from "./../types/header.properties";
import {Constants} from '../utilities/constants';
import {ClientInitialPacket} from './packet/client.initial';
import {VersionNegotiationPacket} from './packet/version.negotiation';
import {HandshakePacket} from './packet/handshake';
import {BasePacket} from './base.packet';
import { ShortHeaderPacket } from './packet/short.header.packet';


export class PacketParser {
    private frameParser: FrameParser;

    public constructor() {
        this.frameParser = new FrameParser();
    }

    public parse(connection: Connection, headerOffset: HeaderOffset, msg: Buffer, endpoint: EndpointType): PacketOffset {
        var header = headerOffset.header;
        if (header.getHeaderType() === HeaderType.LongHeader) {
            return this.parseLongHeaderPacket(connection, header, msg, endpoint)
        }
        return this.parseShortHeaderPacket(connection, headerOffset, msg, endpoint);
    }

    private parseLongHeaderPacket(connection: Connection, header: BaseHeader, buffer: Buffer, endpoint: EndpointType): PacketOffset {
        var longheader = <LongHeader>header;
        var offset = Constants.LONG_HEADER_SIZE;
        switch (header.getPacketType()) {
            case LongHeaderType.Initial:
                return this.parseClientInitialPacket(connection, header, buffer, offset, endpoint);
                // Initial
            case LongHeaderType.Retry:
            // Server Stateless Retry
            case LongHeaderType.Protected0RTT:
                // 0-RTT Protected
                throw new Error("Method not implemented.");
            case LongHeaderType.Handshake:
                return this.parseHandshakePacket(connection, header, buffer, offset, endpoint);
            default:
                // Version negotiation packet
                if (longheader.getVersion().toString() === "00000000") {
                    return this.parseVersionNegotiationPacket(header, buffer, offset);
                }
                // Unknown packet type
                throw new Error("Unknown packet type.");
        }
    }

    private parseShortHeaderPacket(connection: Connection, headerOffset: HeaderOffset, buffer: Buffer, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - headerOffset.offset);
        buffer.copy(dataBuffer, 0, headerOffset.offset);
        dataBuffer = connection.getAEAD().protected1RTTDecrypt(connection, headerOffset.header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new ShortHeaderPacket(headerOffset.header, frames),
            offset: headerOffset.offset
        };
    }

    private parseClientInitialPacket(connection: Connection, header: BaseHeader, buffer: Buffer, offset: number, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - offset);
        buffer.copy(dataBuffer, 0, offset);
        dataBuffer = connection.getAEAD().clearTextDecrypt(connection.getFirstConnectionID(), header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new ClientInitialPacket(header, frames),
            offset: offset
        };
    }

    private parseVersionNegotiationPacket(header: BaseHeader, buffer: Buffer, offset: number): PacketOffset {
        var versions: Version[] = [];
        while (buffer.length > offset) {
            var version: Version = new Version(buffer.slice(offset, offset + 4));
            versions.push(version);
            offset += 4;
        }
        return {
            packet: new VersionNegotiationPacket(header, versions),
            offset: offset
        };
    }

    private parseHandshakePacket(connection: Connection, header: BaseHeader, buffer: Buffer, offset: number, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - offset);
        buffer.copy(dataBuffer, 0, offset);
        dataBuffer = connection.getAEAD().clearTextDecrypt(connection.getFirstConnectionID(), header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new HandshakePacket(header, frames),
            offset: offset
        };
    }
}
/**
 * Interface so that the offset of the buffer is also returned
 */
export interface PacketOffset {
    packet: BasePacket,
    offset: number
}