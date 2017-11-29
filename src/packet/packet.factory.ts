import { ConnectionID, PacketNumber } from "./header/base.header";
import { Version, LongHeader, LongHeaderType } from "./header/long.header";
import { VersionNegotiationPacket } from "./packet/version.negotiation";
import { Constants } from "../utilities/constants";
import { ClientInitialPacket } from "./packet/client.initial";
import { ServerStatelessRetryPacket } from "./packet/server.stateless.retry";
import { ServerCleartextPacket } from "./packet/server.cleartext";
import { ClientCleartextPacket } from "./packet/client.cleartext";


export class PacketFactory {

    /**
     *  Method to create a Version Negotiation packet, given connectionID, packetnumber and version
     * 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public static createVersionNegotiationPacket(connectionID: ConnectionID, packetNumber: PacketNumber, version: Version): VersionNegotiationPacket {
        var header = new LongHeader(LongHeaderType.VersionNegotiation, connectionID, packetNumber, version);
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
    public static createClientInitialPacket(connectionID: ConnectionID, packetNumber: PacketNumber, version: Version): ClientInitialPacket {
        var header = new LongHeader(LongHeaderType.VersionNegotiation, connectionID, packetNumber, version);
        return new ClientInitialPacket(header);
    }

    /**
     *  Method to create a Server Stateless Retry Packet, given connectionID, packetnumber and version
     * 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public static createServerStatelessRetryPacket(connectionID: ConnectionID, packetNumber: PacketNumber, version: Version): ServerStatelessRetryPacket {
        var header = new LongHeader(LongHeaderType.VersionNegotiation, connectionID, packetNumber, version);
        return new ServerStatelessRetryPacket(header);
    }

    /**
     *  Method to create a Server Cleartext Packet, given connectionID, packetnumber and version
     * 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public static createServerCleartextPacket(connectionID: ConnectionID, packetNumber: PacketNumber, version: Version): ServerCleartextPacket {
        var header = new LongHeader(LongHeaderType.VersionNegotiation, connectionID, packetNumber, version);
        return new ServerCleartextPacket(header);
    }

    /**
     *  Method to create a Client Cleartext Packet, given connectionID, packetnumber and version
     * 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public static createClientCleartextPacket(connectionID: ConnectionID, packetNumber: PacketNumber, version: Version): ClientCleartextPacket {
        var header = new LongHeader(LongHeaderType.VersionNegotiation, connectionID, packetNumber, version);
        return new ClientCleartextPacket(header);
    }
}