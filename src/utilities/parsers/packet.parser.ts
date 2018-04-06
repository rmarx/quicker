import { ConnectionErrorCodes } from '../errors/quic.codes';
import { QuicError } from '../errors/connection.error';
import { FrameParser } from './frame.parser';
import { AEAD } from '../../crypto/aead';
import { Connection } from '../../quicker/connection';
import { HeaderOffset } from './header.parser';
import { EndpointType } from '../../types/endpoint.type';
import { HeaderType, BaseHeader } from '../../packet/header/base.header';
import { LongHeader, LongHeaderType } from '../../packet/header/long.header';
import { Version } from "../../packet/header/header.properties";
import { Constants } from '../constants';
import { ClientInitialPacket } from '../../packet/packet/client.initial';
import { VersionNegotiationPacket } from '../../packet/packet/version.negotiation';
import { HandshakePacket } from '../../packet/packet/handshake';
import { BasePacket } from '../../packet/base.packet';
import { ShortHeaderPacket } from '../../packet/packet/short.header.packet';
import { Protected0RTTPacket } from '../../packet/packet/protected.0rtt';
import { BaseEncryptedPacket } from '../../packet/base.encrypted.packet';


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
        // Version negotiation packet
        if (longheader.getVersion().toString() === "00000000") {
            offset = Constants.LONG_HEADER_VN_SIZE;
            return this.parseVersionNegotiationPacket(header, buffer, offset);
        }
        var packetOffset: PacketOffset;
        switch (header.getPacketType()) {
            case LongHeaderType.Initial:
                // Initial
                packetOffset = this.parseClientInitialPacket(connection, header, buffer, offset, endpoint);
                break;
            case LongHeaderType.Protected0RTT:
                // 0-RTT Protected
                packetOffset = this.parseProtected0RTTPacket(connection, header, buffer, offset, endpoint);
                break;
            case LongHeaderType.Retry:
                // Server Stateless Retry
                throw new Error("Method not implemented.");
            case LongHeaderType.Handshake:
                // Handshake packet
                packetOffset = this.parseHandshakePacket(connection, header, buffer, offset, endpoint);
                break;
            default:
                // Unknown packet type
                throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "invalid packet type");
        }
        var baseEncryptedPacket: BaseEncryptedPacket = <BaseEncryptedPacket> packetOffset.packet;
        if (!baseEncryptedPacket.containsValidFrames()) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "invalid frames in packet");
        }
        return packetOffset;
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

    private parseClientInitialPacket(connection: Connection, header: BaseHeader, buffer: Buffer, offset: number, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - offset);
        buffer.copy(dataBuffer, 0, offset);
        dataBuffer = connection.getAEAD().clearTextDecrypt(connection, header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new ClientInitialPacket(header, frames),
            offset: offset
        };
    }

    private parseProtected0RTTPacket(connection: Connection, header: BaseHeader, buffer: Buffer, offset: number, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - offset);
        buffer.copy(dataBuffer, 0, offset);
        dataBuffer = connection.getAEAD().protected0RTTDecrypt(connection, header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new Protected0RTTPacket(header, frames),
            offset: offset
        };
    }

    private parseHandshakePacket(connection: Connection, header: BaseHeader, buffer: Buffer, offset: number, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - offset);
        buffer.copy(dataBuffer, 0, offset);
        dataBuffer = connection.getAEAD().clearTextDecrypt(connection, header, dataBuffer, endpoint);
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