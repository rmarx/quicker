import { FrameHandler } from './frame.handler';
import { Version, ConnectionID } from '../../packet/header/header.properties';
import { PacketLogging } from '../logging/packet.logging';
import { BaseEncryptedPacket } from '../../packet/base.encrypted.packet';
import { TransportParameterType } from '../../crypto/transport.parameters';
import { BaseFrame } from '../../frame/base.frame';
import { Connection } from '../../quicker/connection';
import { BasePacket, PacketType } from '../../packet/base.packet';
import { HandshakePacket } from '../../packet/packet/handshake';
import { EndpointType } from '../../types/endpoint.type';
import { StreamFrame } from '../../frame/stream';
import { PacketFactory } from '../factories/packet.factory';
import { Stream } from '../../quicker/stream';
import { Bignum } from '../../types/bignum';
import { ClientInitialPacket } from '../../packet/packet/client.initial';
import { HandshakeState } from '../../crypto/qtls';
import { ShortHeaderPacket } from '../../packet/packet/short.header.packet';
import { VersionNegotiationPacket } from '../../packet/packet/version.negotiation';
import { LongHeader } from '../../packet/header/long.header';
import { Constants } from '../constants';
import { HeaderType } from '../../packet/header/base.header';
import { VersionValidation } from '../validation/version.validation';
import { QuicError } from '../errors/connection.error';
import { ConnectionErrorCodes } from '../errors/connection.codes';
import { Protected0RTTPacket } from '../../packet/packet/protected.0rtt';
import { Time, TimeFormat } from '../../types/time';

export class PacketHandler {

    private frameHandler: FrameHandler;

    public constructor() {
        this.frameHandler = new FrameHandler();
    }

    public handle(connection: Connection, packet: BasePacket, receivedTime: Time) {
        PacketLogging.getInstance().logIncomingPacket(connection, packet);
        if (packet.getPacketType() !== PacketType.Protected1RTT && connection.getEndpointType() === EndpointType.Server) {
            var longHeader = <LongHeader>packet.getHeader();
            var negotiatedVersion = VersionValidation.validateVersion(connection.getVersion(), longHeader);
            if (negotiatedVersion === undefined) {
                if (packet.getPacketType() === PacketType.Initial) {
                    connection.resetConnectionState();
                    throw new QuicError(ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR);
                } else {
                    return;
                }
            }
            connection.setVersion(negotiatedVersion);
        }
        
        this.onPacketReceived(connection, packet, receivedTime);
        
        switch (packet.getPacketType()) {
            case PacketType.VersionNegotiation:
                var versionNegotiationPacket: VersionNegotiationPacket = <VersionNegotiationPacket>packet;
                this.handleVersionNegotiationPacket(connection, versionNegotiationPacket);
                break;
            case PacketType.Initial:
                var clientInitialPacket: ClientInitialPacket = <ClientInitialPacket>packet;
                this.handleInitialPacket(connection, clientInitialPacket);
                break;
            case PacketType.Handshake:
                var handshakePacket: HandshakePacket = <HandshakePacket>packet;
                this.handleHandshakePacket(connection, handshakePacket);
                break;
            case PacketType.Protected0RTT:
                var protected0RTTPacket: Protected0RTTPacket = <Protected0RTTPacket>packet;
                this.handleProtected0RTTPacket(connection, protected0RTTPacket);
                break;
            case PacketType.Protected1RTT:
                var shortHeaderPacket: ShortHeaderPacket = <ShortHeaderPacket>packet;
                this.handleProtected1RTTPacket(connection, shortHeaderPacket);
        }
        
        connection.sendPackets();
    }

    private handleVersionNegotiationPacket(connection: Connection, versionNegotiationPacket: VersionNegotiationPacket): void {
        var longHeader = <LongHeader>versionNegotiationPacket.getHeader();
        var connectionId = longHeader.getConnectionID();
        if (connection.getFirstConnectionID().toString() !== connectionId.toString()) {
            return;
        }
        var negotiatedVersion = undefined;
        versionNegotiationPacket.getVersions().forEach((version: Version) => {
            var index = Constants.SUPPORTED_VERSIONS.indexOf(version.toString());
            if (index > -1) {
                negotiatedVersion = version;
                return;
            }
        });
        if (negotiatedVersion === undefined) {
            throw new QuicError(ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR);
        }
        connection.resetConnectionState();
        connection.setVersion(negotiatedVersion);
        connection.startConnection();
    }

    private handleInitialPacket(connection: Connection, clientInitialPacket: ClientInitialPacket): void {
        var connectionID = clientInitialPacket.getHeader().getConnectionID();
        if (clientInitialPacket.getFrameSizes() < Constants.CLIENT_INITIAL_MIN_SIZE) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION);
        }
        this.handleFrames(connection, clientInitialPacket);
    }

    private handleHandshakePacket(connection: Connection, handshakePacket: HandshakePacket): void {
        var connectionID = handshakePacket.getHeader().getConnectionID();
        if (connection.getEndpointType() === EndpointType.Client) {
            connection.setConnectionID(connectionID);
        }
        this.handleFrames(connection, handshakePacket);
    }

    private handleProtected0RTTPacket(connection: Connection, protected0RTTPacket: Protected0RTTPacket): any {
        this.handleFrames(connection, protected0RTTPacket);
    }

    private handleProtected1RTTPacket(connection: Connection, shortHeaderPacket: ShortHeaderPacket) {
        this.handleFrames(connection, shortHeaderPacket);
    }

    private handleFrames(connection: Connection, packet: BaseEncryptedPacket) {
        packet.getFrames().forEach((baseFrame: BaseFrame) => {
            this.frameHandler.handle(connection, baseFrame);
        });
    }

    private onPacketReceived(connection: Connection, packet: BasePacket, receivedTime: Time): void {
        connection.getAckHandler().onPacketReceived(connection, packet, receivedTime);
    }
}