import {ConnectionID, PacketNumber} from './header/base.header';
import {VersionNegotiationPacket} from './packet/version.negotiation';
import {Version, LongHeader, LongHeaderType} from './header/long.header';
import {Constants} from '../utilities/constants';
import {QTLS, TransportParameters} from '../crypto/qtls';
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
    public static createVersionNegotiationPacket(connectionID: ConnectionID, packetNumber: PacketNumber): VersionNegotiationPacket {
        var version = new Version(Buffer.from('00000000', 'hex'));
        var header = new LongHeader(LongHeaderType.Default, connectionID, packetNumber, version);
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
    public static createClientInitialPacket(connectionID: ConnectionID, packetNumber: PacketNumber, version: Version, qtls: QTLS): ClientInitialPacket {
        var header = new LongHeader(LongHeaderType.Initial, connectionID, packetNumber, version);
        var transportParameters: TransportParameters = new TransportParameters(false, Constants.DEFAULT_MAX_STREAM_DATA, Constants.DEFAULT_MAX_DATA, Constants.MAX_IDLE_TIMEOUT);
        var transportParamBuffer: Buffer = transportParameters.toBuffer();
        // value of 6 is: 4 for version and 2 for length
        var transportExt = Buffer.alloc(transportParamBuffer.byteLength + 6);
        transportExt.write(Constants.getActiveVersion(), undefined, undefined, 'hex');
        transportExt.writeUInt16BE(transportParamBuffer.byteLength, 4);
        transportParamBuffer.copy(transportExt, 6);
        qtls.setTransportParameters(transportExt);
        var clientInitial = qtls.getClientInitial();
        var streamFrame = new StreamFrame(Bignum.fromNumber(0), clientInitial);
        streamFrame.setLen(true);
        streamFrame.setLength(Bignum.fromNumber(clientInitial.byteLength));
        return new ClientInitialPacket(header, streamFrame);
    }

    /**
     *  Method to create a Server Stateless Retry Packet, given connectionID, packetnumber and version
     * 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public static createServerStatelessRetryPacket(connectionID: ConnectionID, packetNumber: PacketNumber, version: Version): ServerStatelessRetryPacket {
        var header = new LongHeader(LongHeaderType.Retry, connectionID, packetNumber, version);
        return new ServerStatelessRetryPacket(header);
    }

    /**
     *  Method to create a Handshake Packet, given connectionID, packetnumber and version
     * 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public static createHandshakePacket(connectionID: ConnectionID, packetNumber: PacketNumber, version: Version): HandshakePacket {
        var header = new LongHeader(LongHeaderType.Handshake, connectionID, packetNumber, version);
        return new HandshakePacket(header);
    }
}