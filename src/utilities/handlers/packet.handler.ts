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
import { InitialPacket } from '../../packet/packet/initial';
import { HandshakeState } from '../../crypto/qtls';
import { ShortHeaderPacket } from '../../packet/packet/short.header.packet';
import { VersionNegotiationPacket } from '../../packet/packet/version.negotiation';
import { LongHeader } from '../../packet/header/long.header';
import { Constants } from '../constants';
import { HeaderType } from '../../packet/header/base.header';
import { VersionValidation } from '../validation/version.validation';
import { QuicError } from '../errors/connection.error';
import { ConnectionErrorCodes } from '../errors/quic.codes';
import { Protected0RTTPacket } from '../../packet/packet/protected.0rtt';
import { Time, TimeFormat } from '../../types/time';
import { QuickerError } from '../errors/quicker.error';
import { QuickerErrorCodes } from '../errors/quicker.codes';
import { RetryPacket } from '../../packet/packet/retry';
import { VersionNegotiationHeader } from '../../packet/header/version.negotiation.header';

export class PacketHandler {

    private frameHandler: FrameHandler;

    public constructor() {
        this.frameHandler = new FrameHandler();
    }

    public handle(connection: Connection, packet: BasePacket, receivedTime: Time) {
        PacketLogging.getInstance().logIncomingPacket(connection, packet);
        this.onPacketReceived(connection, packet, receivedTime);

        switch (packet.getPacketType()) {
            case PacketType.VersionNegotiation:
                var versionNegotiationPacket: VersionNegotiationPacket = <VersionNegotiationPacket>packet;
                this.handleVersionNegotiationPacket(connection, versionNegotiationPacket);
                break;
            case PacketType.Initial:
                var clientInitialPacket: InitialPacket = <InitialPacket>packet;
                this.handleInitialPacket(connection, clientInitialPacket);
                break;
            case PacketType.Retry:
                var retryPacket: RetryPacket = <RetryPacket>packet;
                this.handleRetryPacket(connection, retryPacket);
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
        // REFACTOR TODO: we should only react to the first VersionNegotationPacket, see https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.2.2
        // not sure if this is checked anywhere yet, but I doubt it 
        var versionNegotiationHeader = <VersionNegotiationHeader>versionNegotiationPacket.getHeader();
        var connectionId = versionNegotiationHeader.getSrcConnectionID();
        var connectionId = versionNegotiationHeader.getDestConnectionID();
        if (connection.getInitialDestConnectionID().getValue().compare(versionNegotiationHeader.getSrcConnectionID().getValue()) !== 0 ||
            connection.getSrcConnectionID().getValue().compare(versionNegotiationHeader.getDestConnectionID().getValue()) !== 0) {
            // https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.2.2
            throw new QuicError(ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR, "Version negotation didn't include correct connectionID values");
        }
        var negotiatedVersion = undefined;

        // REFACTOR TODO: we MUST ignore this packet if it contains our chosen version, see https://tools.ietf.org/html/draft-ietf-quic-transport-12#section-6.2.2

        // This will try to always select the ActiveVersion by going through all server-supported versions until it finds it
		// if it doesn't find it, the chosen version will be the last in the list // TODO: maybe make sure not the last but "most recent" version is chosen?
		for( let version of versionNegotiationPacket.getVersions() ){ 
			if( version.toString() == Constants.getActiveVersion() ){
				negotiatedVersion = version;
				break;
			}
			else{
		        var index = Constants.SUPPORTED_VERSIONS.indexOf(version.toString());
		        if (index > -1) {
		            negotiatedVersion = version;
		        }
			}
        };
        if (negotiatedVersion === undefined) {
            // REFACTOR TODO: this isn't caught anywhere at client side yet (only on server)... needs to be caught and propagated to library user! 
            throw new QuicError(ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR, "No supported version overlap found between Client and Server");
        }
 
        connection.resetConnection(negotiatedVersion);
    }

    // only on SERVER (client sends ClientInitial packet)
    private handleInitialPacket(connection: Connection, clientInitialPacket: InitialPacket): void {
        this.handleFrames(connection, clientInitialPacket);
    }

    // only on the SERVER (client sends stateless retry packet)
    private handleRetryPacket(connection: Connection, retryPacket: RetryPacket): void {
        var longHeader = <LongHeader>retryPacket.getHeader();
        var connectionID = longHeader.getSrcConnectionID();
        if (connection.getEndpointType() === EndpointType.Client) {
            // we only change our client destination ID for the very first retry packet
            // subsequent changes are ignored and we check for them explicitly in the "else if" below
            // https://tools.ietf.org/html/draft-ietf-quic-transport-12#section-4.7
            if (connection.getDestConnectionID() === undefined) {
                connection.setDestConnectionID(connectionID);
                connection.setRetrySent(true);
            } else if (connection.getDestConnectionID().getValue().compare(connectionID.getValue()) !== 0) {
                throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR, "New Destination ConnID discovered in subsequent retry packet, ignoring");
            }
        }
        this.handleFrames(connection, retryPacket);
        connection.resetConnectionState();
    }

    // only on the CLIENT (Server sends handshake in reply to ClientInitial packet)
    private handleHandshakePacket(connection: Connection, handshakePacket: HandshakePacket): void {
        var longHeader = <LongHeader>handshakePacket.getHeader();
        var connectionID = longHeader.getSrcConnectionID();
        if (connection.getEndpointType() === EndpointType.Client) {
            // we only change our server destination ID for the very first handshake packet
            // subsequent changes are ignored and we check for them explicitly in the "else if" below
            // https://tools.ietf.org/html/draft-ietf-quic-transport-12#section-4.7
            if (connection.getDestConnectionID() === undefined || connection.getRetrySent()) {
                connection.setDestConnectionID(connectionID);
                connection.setRetrySent(false);
            } else if (connection.getDestConnectionID().getValue().compare(connectionID.getValue()) !== 0) {
                throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR, "New Destination ConnID discovered in subsequent handshake packet, ignoring");
            }
        }
        this.handleFrames(connection, handshakePacket);
    }

    private handleProtected0RTTPacket(connection: Connection, protected0RTTPacket: Protected0RTTPacket): void {
        this.handleFrames(connection, protected0RTTPacket);
    }

    private handleProtected1RTTPacket(connection: Connection, shortHeaderPacket: ShortHeaderPacket): void {
        this.handleFrames(connection, shortHeaderPacket);
    }

    private handleFrames(connection: Connection, packet: BaseEncryptedPacket): void {
        packet.getFrames().forEach((baseFrame: BaseFrame) => {
            this.frameHandler.handle(connection, baseFrame);
        });
    }

    private onPacketReceived(connection: Connection, packet: BasePacket, receivedTime: Time): void {
        connection.getAckHandler().onPacketReceived(connection, packet, receivedTime);
    }
}
