import {Connection} from '../quicker/connection';
import {BaseFrame} from '../frame/base.frame';
import {PacketNumber, ConnectionID} from './header/base.header';
import {VersionNegotiationPacket} from './packet/version.negotiation';
import {Version, LongHeader, LongHeaderType} from './header/long.header';
import {Constants} from '../utilities/constants';
import {QTLS} from '../crypto/qtls';
import {TransportParameters} from '../crypto/transport.parameters';
import {ClientInitialPacket} from './packet/client.initial';
import {StreamFrame} from '../frame/general/stream';
import {Bignum} from '../utilities/bignum';
import {ServerStatelessRetryPacket} from './packet/server.stateless.retry';
import {HandshakePacket} from './packet/handshake';


export class PacketFactory {

    /**
     *  Method to create a Version Negotiation packet, given connectionID, packetnumber and version
     * 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public static createVersionNegotiationPacket(connection: Connection, packetNumber: PacketNumber): VersionNegotiationPacket {
        var version = new Version(Buffer.from('00000000', 'hex'));
        var header = new LongHeader(LongHeaderType.Default, connection.getConnectionID(), packetNumber, version);
        var versions: Version[] = [];
        Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
            versions.push(new Version(Buffer.from(version, 'hex')));
        });
        return new VersionNegotiationPacket(header, versions);
    }

    /**
     *  Method to create a Client Initial packet, given connectionID, packetnumber and version
     * 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public static createClientInitialPacket(connection: Connection, packetNumber: PacketNumber, version: Version): ClientInitialPacket {
        var header = new LongHeader(LongHeaderType.Initial, connection.getConnectionID(), packetNumber, version);
        var transportParameters: TransportParameters = new TransportParameters(false, Constants.DEFAULT_MAX_STREAM_DATA, Constants.DEFAULT_MAX_DATA, Constants.MAX_IDLE_TIMEOUT);
        var transportParamBuffer: Buffer = transportParameters.toBuffer();
        // value of 6 is: 4 for version and 2 for length
        var transportExt = Buffer.alloc(transportParamBuffer.byteLength + 6);
        transportExt.write(Constants.getActiveVersion(), undefined, undefined, 'hex');
        transportExt.writeUInt16BE(transportParamBuffer.byteLength, 4);
        transportParamBuffer.copy(transportExt, 6);
        connection.getQuicTLS().setTransportParameters(transportExt);
        var clientInitial = connection.getQuicTLS().getClientInitial();
        var streamFrame = new StreamFrame(Bignum.fromNumber(0), clientInitial);
        streamFrame.setLen(true);
        streamFrame.setLength(Bignum.fromNumber(clientInitial.byteLength));
        var stream = connection.getStream(Bignum.fromNumber(0));
        stream.addLocalOffset(streamFrame.getLength());
        return new ClientInitialPacket(header, streamFrame);
    }

    /**
     *  Method to create a Server Stateless Retry Packet, given connectionID, packetnumber and version
     * 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public static createServerStatelessRetryPacket(connection: Connection, packetNumber: PacketNumber, version: Version): ServerStatelessRetryPacket {
        var header = new LongHeader(LongHeaderType.Retry, connection.getConnectionID(), packetNumber, version);
        return new ServerStatelessRetryPacket(header);
    }

    /**
     *  Method to create a Handshake Packet, given connectionID, packetnumber and version
     * 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public static createHandshakePacket(connection: Connection, packetNumber: PacketNumber, version: Version, frames: BaseFrame[]): HandshakePacket {
        var header = new LongHeader(LongHeaderType.Handshake, connection.getConnectionID(), packetNumber, version);
        return new HandshakePacket(header, frames);
    }
}