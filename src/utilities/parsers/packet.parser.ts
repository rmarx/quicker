import { ConnectionErrorCodes } from '../errors/quic.codes';
import { QuicError } from '../errors/connection.error';
import { FrameParser } from './frame.parser';
import { AEAD } from '../../crypto/aead';
import { Connection } from '../../quicker/connection';
import { PartiallyParsedPacket } from './header.parser';
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

interface PacketComponents {
    headerBuffer:Buffer,
    payloadBuffer:Buffer
}

export class PacketParser {
    private frameParser: FrameParser;

    public constructor() {
        this.frameParser = new FrameParser();
    }

    public parse(connection: Connection, packet: PartiallyParsedPacket, endpoint: EndpointType): BasePacket {
        let header = packet.header;

        // TODO: in theory, we MUST discard all packets with invalid version, so we have to check that for each header... but that's quite a bit of overhead?
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.1.1
        if (header.getHeaderType() === HeaderType.LongHeader) {
            return this.parseLongHeaderPacket(connection, packet, endpoint)
        } 
        else if (header.getHeaderType() === HeaderType.VersionNegotiationHeader) {
            return this.parseVersionNegotiationPacket(packet);
        }
        return this.parseShortHeaderPacket(connection, packet, endpoint);
    }

    private parseLongHeaderPacket(connection: Connection, packet: PartiallyParsedPacket, endpoint: EndpointType): BasePacket {
        let longheader = <LongHeader>(packet.header);
        let output:BasePacket|undefined = undefined;

        switch (longheader.getPacketType()) {
            case LongHeaderType.Initial:
                // Initial
                output = this.parseClientInitialPacket(connection, packet, endpoint);
                break;
            case LongHeaderType.Protected0RTT:
                // 0-RTT Protected
                output = this.parseProtected0RTTPacket(connection, packet, endpoint);
                break;
            case LongHeaderType.Retry:
                // Server Stateless Retry
                output = this.parseRetryPacket(connection, packet, endpoint);
                break;
            case LongHeaderType.Handshake:
                // Handshake packet
                output = this.parseHandshakePacket(connection, packet, endpoint);
                break;
            default:
                // Unknown packet type
                throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "invalid packet type " + longheader.getPacketType() );
        }
        var baseEncryptedPacket: BaseEncryptedPacket = <BaseEncryptedPacket> output;
        if (!baseEncryptedPacket.containsValidFrames()) {
            //throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "invalid frames in packet #" + baseEncryptedPacket.getHeader().getPacketNumber()!.toString() + " of type " + PacketType[baseEncryptedPacket.getPacketType()] );
        }
        return output!;
    }

    private parseShortHeaderPacket(connection: Connection,  packet: PartiallyParsedPacket, endpoint: EndpointType): BasePacket {

        let components:PacketComponents = this.splitIntoComponentBuffers( packet );

        //let payloadBuffer = Buffer.alloc(fullPacket.byteLength - headerOffset.offset);
        //fullPacket.copy(payloadBuffer, 0, headerOffset.offset);
        let decryptedPayload = connection.getAEAD().protected1RTTDecrypt(packet.header.getPacketNumber()!, components.headerBuffer, components.payloadBuffer, endpoint);

        let frames = this.frameParser.parse(decryptedPayload, 0);
        // return {
        //     packet: new ShortHeaderPacket(headerOffset.header, frames),
        //     offset: headerOffset.offset
        // };

        return new ShortHeaderPacket(packet.header, frames);
    }

    private parseVersionNegotiationPacket( packet: PartiallyParsedPacket ): BasePacket {
        /*
        var versions: Version[] = [];
        var offset = headerOffset.offset;
        while (buffer.length > offset) {
            var version: Version = new Version(buffer.slice(offset, offset + 4));
            versions.push(version);
            offset += 4;
        }
        */
        throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "packetparser:parseVersionNegotiationPacket : no support for this yet!");
        //return new VersionNegotiationPacket(packet.header, versions);
    }

    private parseClientInitialPacket(connection: Connection,  packet: PartiallyParsedPacket, endpoint: EndpointType): BasePacket {
        //if (buffer.byteLength < Constants.INITIAL_MIN_SIZE && endpoint == EndpointType.Client) {
            //throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "Packet was smaller than the minimum size " + buffer.byteLength + " < " + Constants.INITIAL_MIN_SIZE);
        //    VerboseLogging.error("PacketParser:parseClientInitialPacket : packet was smaller than the minimum size " + buffer.byteLength + " < " + Constants.INITIAL_MIN_SIZE + " and should be padded!");
        //}
        // TODO: re-enable above check for the first packet coming from the client (others can be smaller than 1200 but we need to check that the first is 1200 to prevent amplification attacks)

        let components:PacketComponents = this.splitIntoComponentBuffers( packet );
        
        let decryptedPayload = connection.getAEAD().clearTextDecrypt(connection.getInitialDestConnectionID(), (packet.header as LongHeader).getVersion(), packet.header.getPacketNumber()!, components.headerBuffer, components.payloadBuffer, endpoint);
        let frames = this.frameParser.parse(decryptedPayload, 0);

        return new InitialPacket(packet.header, frames);
    }

    private parseProtected0RTTPacket(connection: Connection, packet: PartiallyParsedPacket, endpoint: EndpointType): BasePacket {
        let components:PacketComponents = this.splitIntoComponentBuffers( packet );
        
        let decryptedPayload = connection.getAEAD().protected0RTTDecrypt(packet.header.getPacketNumber()!, components.headerBuffer, components.payloadBuffer, endpoint);
        let frames = this.frameParser.parse(decryptedPayload, 0);

        return new Protected0RTTPacket(packet.header, frames);
    }

    private parseHandshakePacket(connection: Connection, packet: PartiallyParsedPacket, endpoint: EndpointType): BasePacket {
        let components:PacketComponents = this.splitIntoComponentBuffers( packet );
        
        let decryptedPayload = connection.getAEAD().protectedHandshakeDecrypt(packet.header.getPacketNumber()!, components.headerBuffer, components.payloadBuffer, endpoint);
        let frames = this.frameParser.parse(decryptedPayload, 0);

        return new HandshakePacket(packet.header, frames);
    }

    private parseRetryPacket(connection: Connection, packet: PartiallyParsedPacket, endpoint: EndpointType): BasePacket {

        throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "packetparser:parseRetryPacket : no support for this yet!");
        /*
        let components:PacketComponents = this.splitIntoComponentBuffers( packet );
        
        let decryptedPayload = connection.getAEAD().clearTextDecrypt(connection.getInitialDestConnectionID(), components.headerBuffer, components.payloadBuffer, endpoint);
        let frames = this.frameParser.parse(decryptedPayload, 0);

        return new RetryPacket(packet.header, frames);
        */
    }

    private splitIntoComponentBuffers( packet: PartiallyParsedPacket ): PacketComponents {

        // packet.actualHeaderLength MUST be correctly set before coming into this method
        // we expect it to be done currently in HeaderHandler:decryptHeader
        if( packet.actualHeaderLength === undefined ){
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "PacketParser:splitIntoComponentBuffers : unknown actualHeaderLength, cannot split packet into header and payload!");
        }

        return {
            headerBuffer:  packet.fullContents.slice(0, packet.actualHeaderLength),
            payloadBuffer: packet.fullContents.slice(packet.actualHeaderLength, packet.fullContents.byteLength)
        };
    }
}