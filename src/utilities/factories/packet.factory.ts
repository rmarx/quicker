import {PaddingFrame} from '../../frame/padding';
import {Stream} from '../../quicker/stream';
import {Connection} from '../../quicker/connection';
import {PacketNumber, Version} from '../../packet/header/header.properties';
import {VersionNegotiationPacket} from '../../packet/packet/version.negotiation';
import {LongHeader, LongHeaderType} from '../../packet/header/long.header';
import {Constants} from '../constants';
import {ClientInitialPacket} from '../../packet/packet/client.initial';
import {StreamFrame} from '../../frame/stream';
import {Bignum} from '../../types/bignum';
import {RetryPacket} from '../../packet/packet/retry';
import {BaseFrame} from '../../frame/base.frame';
import {HandshakePacket} from '../../packet/packet/handshake';
import { ShortHeaderPacket } from '../../packet/packet/short.header.packet';
import { ShortHeader, ShortHeaderType } from '../../packet/header/short.header';
import { TransportParameterType } from '../../crypto/transport.parameters';
import { EndpointType } from '../../types/endpoint.type';
import { Protected0RTTPacket } from '../../packet/packet/protected.0rtt';
import { VersionNegotiationHeader } from '../../packet/header/version.negotiation.header';



export class PacketFactory {

    /**
     *  Method to create a Version Negotiation packet, given the connection
     * 
     * @param connection
     */
    public static createVersionNegotiationPacket(connection: Connection): VersionNegotiationPacket {
        var version = new Version(Buffer.from('00000000', 'hex'));
        // is only created by a server in response to a client that had an unsupported version in its ClientInitial packet
        // destConnectionID must be the srcID the client wanted (is in getDestConnectionID, as expected)
        // srcConnectionID must echo the random value the client choose for us, so NO CUSTOM GENERATED VALUE
        // for some reason, in our implementation, we get that client-generated value from getInitialDestConnectionID (which is correct, in theory, but quite difficult to reason about)
        // REFACTOR TODO: maybe rename the initialDestConnectionID to something that more clearly describes its goal at the server? or make a separate var for this? 
        // https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.3
        var header = new VersionNegotiationHeader((Math.random() * 128), connection.getDestConnectionID(), connection.getInitialDestConnectionID());
        var versions: Version[] = [];
        Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
            versions.push(new Version(Buffer.from(version, 'hex')));
        });
        return new VersionNegotiationPacket(header, versions);
    }

    /**
     *  Method to create a Client Initial packet, given the connection object and frames
     * 
     * @param connection
     */
    public static createClientInitialPacket(connection: Connection, frames: BaseFrame[]): ClientInitialPacket {
        // TODO: explicitly set packet nr to 0
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.4.1 "The first Initial packet that is sent by a client contains a packet number of 0."
        var header = new LongHeader(LongHeaderType.Initial, connection.getInitialDestConnectionID(), connection.getSrcConnectionID(), new PacketNumber(-1), new Bignum(-1), connection.getVersion());
        var clientInitial = new ClientInitialPacket(header, frames);

        // for security purposes, we want our initial packet to always be the exact same size (1280 bytes)
        // so we add PADDING frames to reach that size if the encrypted initial packet isn't long enough. 
        // https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.4.1
        var size = clientInitial.getSize();
        if (size < Constants.CLIENT_INITIAL_MIN_SIZE) {
            var padding = new PaddingFrame(Constants.CLIENT_INITIAL_MIN_SIZE - size)
            clientInitial.getFrames().push(padding);
        }
        header.setPayloadLength(clientInitial.getFrameSizes() + Constants.DEFAULT_AEAD_LENGTH);
        return clientInitial;
    }

    /**
     *  Method to create a Server Stateless Retry Packet, given the connection
     * 
     * @param connection
     */
    public static createRetryPacket(connection: Connection, frames: BaseFrame[]): RetryPacket {
        // UPDATE-12 TODO: packet number of a retry packet MUST be set to zero https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.4.2
        var header = new LongHeader(LongHeaderType.Retry, connection.getDestConnectionID(), connection.getInitialDestConnectionID(), new PacketNumber(0), new Bignum(-1), connection.getVersion());
        return new RetryPacket(header, frames);
    }

    /**
     *  Method to create a Handshake Packet, given the connection object and frames
     * 
     * @param connection 
     * @param frames 
     */
    public static createHandshakePacket(connection: Connection, frames: BaseFrame[]): HandshakePacket {
        var dstConnectionID = connection.getDestConnectionID() === undefined ? connection.getInitialDestConnectionID() : connection.getDestConnectionID();
        var header = new LongHeader(LongHeaderType.Handshake, dstConnectionID, connection.getSrcConnectionID(), new PacketNumber(-1), new Bignum(-1), connection.getVersion());
        var packet = new HandshakePacket(header, frames);
        header.setPayloadLength(packet.getFrameSizes() + Constants.DEFAULT_AEAD_LENGTH);
        return packet;
    }

    public static createProtected0RTTPacket(connection: Connection, frames: BaseFrame[]): Protected0RTTPacket {
        // UPDATE-12 TODO: new packet number encryption setup is needed here + extra protection
        // https://tools.ietf.org/html/draft-ietf-quic-transport-12#section-4.5
        var header = new LongHeader(LongHeaderType.Protected0RTT, connection.getInitialDestConnectionID(), connection.getSrcConnectionID(), new PacketNumber(-1), new Bignum(-1), connection.getVersion());
        var packet = new Protected0RTTPacket(header, frames);
        header.setPayloadLength(packet.getFrameSizes() + Constants.DEFAULT_AEAD_LENGTH);
        return packet;
    }

    /**
     *  Method to create a ShortHeader Packet, given the connection object and frames
     * TODO: dynamic shortheader type and keyphasebit
     * @param connection 
     * @param frames 
     */
    public static createShortHeaderPacket(connection: Connection, frames: BaseFrame[]): ShortHeaderPacket {
        var header = new ShortHeader(ShortHeaderType.FourOctet, connection.getDestConnectionID(), new PacketNumber(-1), false, connection.getSpinBit());
        return new ShortHeaderPacket(header, frames);
    }
}