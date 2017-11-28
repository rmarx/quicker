import { BasePacket, PacketType } from "../base.packet";
import { Version, LongHeader, LongHeaderType } from "../header/long.header";
import { BaseHeader, HeaderType, PacketNumber, ConnectionID } from "../header/base.header";
import { Constants } from "../../helpers/constants";
import { AEAD } from "../../crypto/aead";
import { EndpointType } from "../../quicker/type";



export class ClientInitialPacket extends BasePacket {
    
    public constructor(header: BaseHeader) {
        super(PacketType.ClientInitial, header);
    }

    /**
     * Method to get buffer object from a ClientInitialPacket object
     */
    public toBuffer() {
        if (this.getHeader() === undefined) {
            throw Error("Header is not defined");
        }
        var headerBuffer = this.getHeader().toBuffer();
        
        return headerBuffer;
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
}