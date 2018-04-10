import {ConnectionErrorCodes} from '../errors/quic.codes';
import {QuicError} from '../errors/connection.error';
import {FrameParser} from './frame.parser';
import {AEAD} from '../../crypto/aead';
import {Connection} from '../../quicker/connection';
import {HeaderOffset} from './header.parser';
import {EndpointType} from '../../types/endpoint.type';
import {HeaderType, BaseHeader} from '../../packet/header/base.header';
import {LongHeader, LongHeaderType} from '../../packet/header/long.header';
import {Version} from "../../packet/header/header.properties";
import {Constants} from '../constants';
import {ClientInitialPacket} from '../../packet/packet/client.initial';
import {VersionNegotiationPacket} from '../../packet/packet/version.negotiation';
import {HandshakePacket} from '../../packet/packet/handshake';
import {BasePacket} from '../../packet/base.packet';
import { ShortHeaderPacket } from '../../packet/packet/short.header.packet';
import { Protected0RTTPacket } from '../../packet/packet/protected.0rtt';


export class PacketParser {
    private frameParser: FrameParser;

    public constructor() {
        this.frameParser = new FrameParser();
    }

    public parse(connection: Connection, headerOffset: HeaderOffset, msg: Buffer, endpoint: EndpointType): PacketOffset {
        var header = headerOffset.header;
        if (header.getHeaderType() === HeaderType.LongHeader) {
            return this.parseLongHeaderPacket(connection, headerOffset, msg, endpoint)
        }
        return this.parseShortHeaderPacket(connection, headerOffset, msg, endpoint);
    }

    private parseLongHeaderPacket(connection: Connection, headerOffset: HeaderOffset, buffer: Buffer, endpoint: EndpointType): PacketOffset {
        var longheader = <LongHeader>(headerOffset.header);
        // Version negotiation packet
        if (longheader.getVersion().toString() === "00000000") {
            return this.parseVersionNegotiationPacket(headerOffset, buffer);
        }
        switch (longheader.getPacketType()) {
            case LongHeaderType.Initial:
                return this.parseClientInitialPacket(connection, headerOffset, buffer, endpoint);
                // Initial
            case LongHeaderType.Protected0RTT:
                return this.parseProtected0RTTPacket(connection, headerOffset, buffer, endpoint);
                // 0-RTT Protected
            case LongHeaderType.Retry:
                // Server Stateless Retry
                throw new Error("Method not implemented.");
            case LongHeaderType.Handshake:
                return this.parseHandshakePacket(connection, headerOffset, buffer, endpoint);
            default:
                // Unknown packet type
                throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION);
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

    private parseVersionNegotiationPacket(headerOffset: HeaderOffset, buffer: Buffer): PacketOffset {
        var versions: Version[] = [];
        var offset = headerOffset.offset;
        while (buffer.length > offset) {
            var version: Version = new Version(buffer.slice(offset, offset + 4));
            versions.push(version);
            offset += 4;
        }
        return {
            packet: new VersionNegotiationPacket(headerOffset.header, versions),
            offset: offset
        };
    }

    private parseClientInitialPacket(connection: Connection, headerOffset: HeaderOffset, buffer: Buffer, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - headerOffset.offset);
        buffer.copy(dataBuffer, 0, headerOffset.offset);
        dataBuffer = connection.getAEAD().clearTextDecrypt(connection, headerOffset.header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new ClientInitialPacket(headerOffset.header, frames),
            offset: headerOffset.offset
        };
    }

    private parseProtected0RTTPacket(connection: Connection, headerOffset: HeaderOffset, buffer: Buffer, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - headerOffset.offset);
        buffer.copy(dataBuffer, 0, headerOffset.offset);
        dataBuffer = connection.getAEAD().protected0RTTDecrypt(connection, headerOffset.header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new Protected0RTTPacket(headerOffset.header, frames),
            offset: headerOffset.offset
        };
    }

    private parseHandshakePacket(connection: Connection, headerOffset: HeaderOffset, buffer: Buffer, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - headerOffset.offset);
        buffer.copy(dataBuffer, 0, headerOffset.offset);
        dataBuffer = connection.getAEAD().clearTextDecrypt(connection, headerOffset.header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new HandshakePacket(headerOffset.header, frames),
            offset: headerOffset.offset
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