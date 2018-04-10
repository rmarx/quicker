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
import {ServerStatelessRetryPacket} from '../../packet/packet/server.stateless.retry';
import {BaseFrame} from '../../frame/base.frame';
import {HandshakePacket} from '../../packet/packet/handshake';
import { ShortHeaderPacket } from '../../packet/packet/short.header.packet';
import { ShortHeader, ShortHeaderType } from '../../packet/header/short.header';
import { TransportParameterType } from '../../crypto/transport.parameters';
import { EndpointType } from '../../types/endpoint.type';
import { Protected0RTTPacket } from '../../packet/packet/protected.0rtt';



export class PacketFactory {

    /**
     *  Method to create a Version Negotiation packet, given the connection
     * 
     * @param connection
     */
    public static createVersionNegotiationPacket(connection: Connection): VersionNegotiationPacket {
        var version = new Version(Buffer.from('00000000', 'hex'));
        var header = new LongHeader((Math.random() * 128), connection.getDestConnectionID(), connection.getInitialDestConnectionID(), undefined, version);
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
        var header = new LongHeader(LongHeaderType.Initial, connection.getInitialDestConnectionID(), connection.getSrcConnectionID(), undefined, connection.getVersion());
        var clientInitial = new ClientInitialPacket(header, frames);
        var size = clientInitial.getSize();
        if (size < Constants.CLIENT_INITIAL_MIN_SIZE) {
            var padding = new PaddingFrame(Constants.CLIENT_INITIAL_MIN_SIZE - size)
            clientInitial.getFrames().push(padding);
        }
        return clientInitial;
    }

    /**
     *  Method to create a Server Stateless Retry Packet, given the connection
     * 
     * @param connection
     */
    public static createServerStatelessRetryPacket(connection: Connection, frame: StreamFrame): ServerStatelessRetryPacket {
        var header = new LongHeader(LongHeaderType.Retry, connection.getDestConnectionID(), connection.getInitialDestConnectionID(), undefined, connection.getVersion());
        return new ServerStatelessRetryPacket(header, frame);
    }

    /**
     *  Method to create a Handshake Packet, given the connection object and frames
     * 
     * @param connection 
     * @param frames 
     */
    public static createHandshakePacket(connection: Connection, frames: BaseFrame[]): HandshakePacket {
        var header = new LongHeader(LongHeaderType.Handshake, connection.getDestConnectionID(), connection.getSrcConnectionID(), undefined, connection.getVersion());
        return new HandshakePacket(header, frames);
    }

    public static createProtected0RTTPacket(connection: Connection, frames: BaseFrame[]): Protected0RTTPacket {
        var header = new LongHeader(LongHeaderType.Protected0RTT, connection.getInitialDestConnectionID(), connection.getSrcConnectionID(), undefined, connection.getVersion());
        return new Protected0RTTPacket(header, frames);
    }

    /**
     *  Method to create a ShortHeader Packet, given the connection object and frames
     * TODO: dynamic shortheader type and keyphasebit
     * @param connection 
     * @param frames 
     */
    public static createShortHeaderPacket(connection: Connection, frames: BaseFrame[]): ShortHeaderPacket {
        var header = new ShortHeader(ShortHeaderType.FourOctet, connection.getDestConnectionID(), undefined, false)
        return new ShortHeaderPacket(header, frames);
    }
}