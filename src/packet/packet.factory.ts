import {PaddingFrame} from '../frame/general/padding';
import {Stream} from '../types/stream';
import {Connection} from '../types/connection';
import {PacketNumber, Version} from './../types/header.properties';
import {VersionNegotiationPacket} from './packet/version.negotiation';
import {LongHeader, LongHeaderType} from './header/long.header';
import {Constants} from '../utilities/constants';
import {ClientInitialPacket} from './packet/client.initial';
import {StreamFrame} from '../frame/general/stream';
import {Bignum} from '../types/bignum';
import {ServerStatelessRetryPacket} from './packet/server.stateless.retry';
import {BaseFrame} from '../frame/base.frame';
import {HandshakePacket} from './packet/handshake';
import { ShortHeaderPacket } from './packet/short.header.packet';
import { ShortHeader, ShortHeaderType } from './header/short.header';
import { TransportParameterType } from './../crypto/transport.parameters';
import { EndpointType } from '../types/endpoint.type';



export class PacketFactory {

    /**
     *  Method to create a Version Negotiation packet, given the connection
     * 
     * @param connection
     */
    public static createVersionNegotiationPacket(connection: Connection): VersionNegotiationPacket {
        var version = new Version(Buffer.from('00000000', 'hex'));
        var header = new LongHeader(LongHeaderType.Default, connection.getFirstConnectionID(), connection.getNextPacketNumber(), version);
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
    public static createClientInitialPacket(connection: Connection): ClientInitialPacket {
        var header = new LongHeader(LongHeaderType.Initial, connection.getFirstConnectionID(), connection.getNextPacketNumber(), connection.getVersion());
        var clientInitial = connection.getQuicTLS().getClientInitial(connection);
        var streamFrame = new StreamFrame(Bignum.fromNumber(0), clientInitial);
        streamFrame.setLength(Bignum.fromNumber(clientInitial.byteLength));
        var stream = connection.getStream(Bignum.fromNumber(0));
        var size = streamFrame.toBuffer().byteLength;
        var frames: BaseFrame[] = [streamFrame];
        if (size < Constants.CLIENT_INITIAL_MIN_SIZE) {
            var padding = new PaddingFrame(Constants.CLIENT_INITIAL_MIN_SIZE - size)
            frames.push(padding);
        }
        return new ClientInitialPacket(header, frames);
    }

    /**
     *  Method to create a Server Stateless Retry Packet, given the connection
     * 
     * @param connection
     */
    public static createServerStatelessRetryPacket(connection: Connection): ServerStatelessRetryPacket {
        var header = new LongHeader(LongHeaderType.Retry, connection.getConnectionID(), connection.getNextPacketNumber(), connection.getVersion(),);
        return new ServerStatelessRetryPacket(header);
    }

    /**
     *  Method to create a Handshake Packet, given the connection object and frames
     * 
     * @param connection 
     * @param frames 
     */
    public static createHandshakePacket(connection: Connection, frames: BaseFrame[]): HandshakePacket {
        var header = new LongHeader(LongHeaderType.Handshake, connection.getConnectionID(), connection.getNextPacketNumber(), connection.getVersion(),);
        return new HandshakePacket(header, frames);
    }

    /**
     *  Method to create a ShortHeader Packet, given the connection object and frames
     * TODO: dynamic shortheader type and keyphasebit
     * @param connection 
     * @param frames 
     */
    public static createShortHeaderPacket(connection: Connection, frames: BaseFrame[]): ShortHeaderPacket {
        var omitConnectionID: boolean = connection.getRemoteTransportParameter(TransportParameterType.OMIT_CONNECTION_ID);
        var header = new ShortHeader(ShortHeaderType.FourOctet, connection.getConnectionID(), connection.getNextPacketNumber(), omitConnectionID, false)
        return new ShortHeaderPacket(header, frames);
    }
}