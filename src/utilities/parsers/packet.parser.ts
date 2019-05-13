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
import { InitialPacket } from '../../packet/packet/initial';
import { VersionNegotiationPacket } from '../../packet/packet/version.negotiation';
import { HandshakePacket } from '../../packet/packet/handshake';
import { BasePacket, PacketType } from '../../packet/base.packet';
import { ShortHeaderPacket } from '../../packet/packet/short.header.packet';
import { Protected0RTTPacket } from '../../packet/packet/protected.0rtt';
import { BaseEncryptedPacket } from '../../packet/base.encrypted.packet';
import { Bignum } from '../../types/bignum';
import { RetryPacket } from '../../packet/packet/retry';
import { VersionValidation } from '../validation/version.validation';
import { VerboseLogging } from '../logging/verbose.logging';


export class PacketParser {
    private frameParser: FrameParser;

    public constructor() {
        this.frameParser = new FrameParser();
    }

    public parse(connection: Connection, headerOffset: HeaderOffset, fullPacket: Buffer, endpoint: EndpointType): PacketOffset {
        var header = headerOffset.header;
        // TODO: in theory, we MUST discard all packets with invalid version, so we have to check that for each header... but that's quite a bit of overhead?
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.1.1
        if (header.getHeaderType() === HeaderType.LongHeader) {
            return this.parseLongHeaderPacket(connection, headerOffset, fullPacket, endpoint)
        } else if (header.getHeaderType() === HeaderType.VersionNegotiationHeader) {
            return this.parseVersionNegotiationPacket(headerOffset, fullPacket);
        }
        return this.parseShortHeaderPacket(connection, headerOffset, fullPacket, endpoint);
    }

    private parseLongHeaderPacket(connection: Connection, headerOffset: HeaderOffset, buffer: Buffer, endpoint: EndpointType): PacketOffset {
        var longheader = <LongHeader>(headerOffset.header);
        var packetOffset: PacketOffset;
        switch (longheader.getPacketType()) {
            case LongHeaderType.Initial:
                // Initial
                packetOffset = this.parseClientInitialPacket(connection, headerOffset, buffer, endpoint);
                break;
            case LongHeaderType.Protected0RTT:
                // 0-RTT Protected
                packetOffset = this.parseProtected0RTTPacket(connection, headerOffset, buffer, endpoint);
                break;
            case LongHeaderType.Retry:
                // Server Stateless Retry
                packetOffset = this.parseRetryPacket(connection, headerOffset, buffer, endpoint);
                break;
            case LongHeaderType.Handshake:
                // Handshake packet
                packetOffset = this.parseHandshakePacket(connection, headerOffset, buffer, endpoint);
                break;
            default:
                // Unknown packet type
                throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "invalid packet type " + longheader.getPacketType() );
        }
        var baseEncryptedPacket: BaseEncryptedPacket = <BaseEncryptedPacket>packetOffset.packet;
        if (!baseEncryptedPacket.containsValidFrames()) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "invalid frames in packet #" + baseEncryptedPacket.getHeader().getPacketNumber()!.toString() + " of type " + PacketType[baseEncryptedPacket.getPacketType()] );
        }
        return packetOffset;
    }

    private parseShortHeaderPacket(connection: Connection, headerOffset: HeaderOffset, fullPacket: Buffer, endpoint: EndpointType): PacketOffset {
        // shortHeaderPacket is never coalesced and takes up the full message, so we just read from end of the header to the end of the packet 
        let payloadBuffer = Buffer.alloc(fullPacket.byteLength - headerOffset.offset);
        fullPacket.copy(payloadBuffer, 0, headerOffset.offset);
        payloadBuffer = connection.getAEAD().protected1RTTDecrypt(headerOffset.header, payloadBuffer, endpoint);

        let frames = this.frameParser.parse(payloadBuffer, 0);
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
        //if (buffer.byteLength < Constants.INITIAL_MIN_SIZE && endpoint == EndpointType.Client) {
            //throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "Packet was smaller than the minimum size " + buffer.byteLength + " < " + Constants.INITIAL_MIN_SIZE);
        //    VerboseLogging.error("PacketParser:parseClientInitialPacket : packet was smaller than the minimum size " + buffer.byteLength + " < " + Constants.INITIAL_MIN_SIZE + " and should be padded!");
        //}
        // TODO: re-enable above check for the first packet coming from the client (others can be smaller than 1200 but we need to check that the first is 1200 to prevent amplification attacks)

        var dataBuffer = this.getDataBuffer(headerOffset, buffer);
        dataBuffer = connection.getAEAD().clearTextDecrypt(connection.getInitialDestConnectionID(), headerOffset.header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new InitialPacket(headerOffset.header, frames),
            offset: headerOffset.offset
        };
    }

    private parseProtected0RTTPacket(connection: Connection, headerOffset: HeaderOffset, buffer: Buffer, endpoint: EndpointType): PacketOffset {
        var dataBuffer = this.getDataBuffer(headerOffset, buffer);
        dataBuffer = connection.getAEAD().protected0RTTDecrypt(headerOffset.header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new Protected0RTTPacket(headerOffset.header, frames),
            offset: headerOffset.offset
        };
    }

    private parseRetryPacket(connection: Connection, headerOffset: HeaderOffset, buffer: Buffer, endpoint: EndpointType): PacketOffset {
        var dataBuffer = this.getDataBuffer(headerOffset, buffer);
        dataBuffer = connection.getAEAD().clearTextDecrypt(connection.getInitialDestConnectionID(), headerOffset.header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new RetryPacket(headerOffset.header, frames),
            offset: headerOffset.offset
        };
    }

    private parseHandshakePacket(connection: Connection, headerOffset: HeaderOffset, buffer: Buffer, endpoint: EndpointType): PacketOffset {
        var dataBuffer = this.getDataBuffer(headerOffset, buffer);
        //dataBuffer = connection.getAEAD().clearTextDecrypt(connection.getInitialDestConnectionID(), headerOffset.header, dataBuffer, endpoint);
        dataBuffer = connection.getAEAD().protectedHandshakeDecrypt(headerOffset.header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new HandshakePacket(headerOffset.header, frames),
            offset: headerOffset.offset
        };
    }

    private getDataBuffer(headerOffset: HeaderOffset, buffer: Buffer): Buffer {
        var longHeader = <LongHeader>headerOffset.header;
        var payloadLength = longHeader.getPayloadLength();
        var length = payloadLength !== undefined ? payloadLength.toNumber() : buffer.byteLength;
        var dataBuffer = Buffer.alloc(length);
        buffer.copy(dataBuffer, 0, headerOffset.offset, headerOffset.offset + length);
        return dataBuffer;
    }
}
/**
 * Interface so that the offset of the buffer is also returned
 */
export interface PacketOffset {
    packet: BasePacket,
    offset: number
}