import { FrameHandler } from './frame.handler';
import { Version, ConnectionID } from '../../packet/header/header.properties';
import { PacketLogging } from '../logging/packet.logging';
import { BaseEncryptedPacket } from '../../packet/base.encrypted.packet';
import { TransportParameterId } from '../../crypto/transport.parameters';
import { BaseFrame, FrameType } from '../../frame/base.frame';
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
import { CryptoFrame } from '../../frame/crypto';
import { EncryptionLevel } from '../../crypto/crypto.context';
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
import { VerboseLogging } from '../logging/verbose.logging';
import { AckFrame } from '../../frame/ack';

export class PacketHandler {

    private frameHandler: FrameHandler;

    public constructor() {
        this.frameHandler = new FrameHandler();
    }

    public handle(connection: Connection, packet: BasePacket, receivedTime: Time) {
        connection.getQlogger().onPacketRX(packet);
        PacketLogging.getInstance().logIncomingPacket(connection, packet);

        this.onPacketReceived(connection, packet, receivedTime);

        switch (packet.getPacketType()) {
            case PacketType.VersionNegotiation:
                var versionNegotiationPacket: VersionNegotiationPacket = <VersionNegotiationPacket>packet;
                this.handleVersionNegotiationPacket(connection, versionNegotiationPacket);
                break;
            case PacketType.Initial:
                var initialPacket: InitialPacket = <InitialPacket>packet;
                this.handleInitialPacket(connection, initialPacket);
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
        // incoming packet has been processed, this has probably led to new packets being created which we want to send ASAP
        // TODO: possibly best to do some pacing somewhere? not do this for each incoming packet etc.? so we can have higher coalescing/compounding/less duplicate ACKs?
        connection.sendPackets();
    }

    private handleVersionNegotiationPacket(connection: Connection, versionNegotiationPacket: VersionNegotiationPacket): void {
        // we should only react to the first VersionNegotationPacket, see https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.2.2
        if (connection.getVersion().toString() !== connection.getInitialVersion().toString()) {
            return;
        }

        var versionNegotiationHeader = <VersionNegotiationHeader>versionNegotiationPacket.getHeader();
        var connectionId = versionNegotiationHeader.getSrcConnectionID();
        var connectionId = versionNegotiationHeader.getDestConnectionID();
        if (connection.getInitialDestConnectionID().getValueForComparison().compare(versionNegotiationHeader.getSrcConnectionID().getValueForComparison()) !== 0 ||
            connection.getSrcConnectionID().getValueForComparison().compare(versionNegotiationHeader.getDestConnectionID().getValueForComparison()) !== 0) {
            // https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.2.2
            throw new QuicError(ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR, "Version negotation didn't include correct connectionID values");
        }

        // we MUST ignore this packet if it contains our chosen version, see https://tools.ietf.org/html/draft-ietf-quic-transport-12#section-6.2.2
        var containsChosenVersion = false;
        versionNegotiationPacket.getVersions().forEach((version: Version) => {
            containsChosenVersion = containsChosenVersion || (version.toString() === connection.getInitialVersion().toString());
        });
        if (containsChosenVersion) {
            VerboseLogging.info("PacketHandler:handleVNegPacket: packet contained our initially chosen version, ignoring..." + connection.getInitialVersion().toString());
            return;
        }

        // This will try to always select the ActiveVersion by going through all server-supported versions until it finds it
        // if it doesn't find it, the chosen version will be the last in the list // TODO: maybe make sure not the last but "most recent" version is chosen?
        let negotiatedVersion:Version|undefined = undefined;
        for (let version of versionNegotiationPacket.getVersions()) {
            if (version.toString() == Constants.getActiveVersion()) {
                negotiatedVersion = version;
                break;
            }
            else {
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

    private handleInitialPacket(connection: Connection, initialPacket: InitialPacket): void {
        // TODO: compliance: if this is the second initial we get after a VNEG, we need to check it uses correct packet number 1 instead of 0
        // Note: if we properly deal with duplicate packet numbers, this should be an auto-fix though? 
        let longHeader = <LongHeader>initialPacket.getHeader();
        let connectionID = longHeader.getSrcConnectionID();
        if (connection.getEndpointType() === EndpointType.Client) {
            // we only change our server destination ID for the very first initial packet
            // afterwards, NEW_CONNECTION_ID frames should be used
            if (connection.getDestConnectionID() === undefined || connection.getRetrySent()) {
                connection.setDestConnectionID(connectionID);
                connection.setRetrySent(false);
            } else if (connection.getDestConnectionID().getValueForComparison().compare(connectionID.getValueForComparison()) !== 0) {
                throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR, "New Destination ConnID discovered in subsequent handshake packet, ignoring");
            }
        }
        this.handleFrames(connection, initialPacket);
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
            } else if (connection.getDestConnectionID().getValueForComparison().compare(connectionID.getValueForComparison()) !== 0) {
                throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR, "New Destination ConnID discovered in subsequent retry packet, ignoring");
            }
        }
        this.handleFrames(connection, retryPacket);
        connection.resetConnectionState();
    }

    private handleHandshakePacket(connection: Connection, handshakePacket: HandshakePacket): void {
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
            // crypto frames explicitly belong to a certain encryption level, which is based on the type of packet they arrive in 
            if( baseFrame.getType() == FrameType.CRYPTO || baseFrame.getType() == FrameType.ACK ){
                let cryptoLevel:EncryptionLevel = EncryptionLevel.INITIAL;

                switch( packet.getPacketType() ){
                    case PacketType.Initial:
                        cryptoLevel = EncryptionLevel.INITIAL;
                        break;
                    case PacketType.Handshake:
                        cryptoLevel = EncryptionLevel.HANDSHAKE;
                        break;
                    case PacketType.Protected0RTT:
                        cryptoLevel = EncryptionLevel.ZERO_RTT;
                        break;
                    case PacketType.Protected1RTT:
                        cryptoLevel = EncryptionLevel.ONE_RTT;
                        break;
                    default:
                        VerboseLogging.error("PacketHandler:handleFrames : CRYPTO frame in unexpected packet type " + PacketType[packet.getPacketType()] );
                        break;
                };

                if( baseFrame.getType() == FrameType.CRYPTO ){
                    let cryptoFrame:CryptoFrame = baseFrame as CryptoFrame;
                    cryptoFrame.setCryptoLevel( cryptoLevel );
                }
                else{
                    let ackFrame:AckFrame = baseFrame as AckFrame;
                    ackFrame.setCryptoLevel( cryptoLevel );
                }

                this.frameHandler.handle(connection, baseFrame);
            }
            else{
                this.frameHandler.handle(connection, baseFrame);
            }
        });
    }

    private onPacketReceived(connection: Connection, packet: BasePacket, receivedTime: Time): void {
        let ctx = connection.getEncryptionContextByPacketType( packet.getPacketType() );
        if( ctx ){ // VNEG and RETRY packets don't generate ACKs 
            ctx.getAckHandler().onPacketReceived( connection, packet, receivedTime );
        }
        //connection.getAckHandler().onPacketReceived(connection, packet, receivedTime);
    }
}
