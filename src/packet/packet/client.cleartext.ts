import { BasePacket, PacketType } from "../base.packet";
import { Version, LongHeader, LongHeaderType } from "../header/long.header";
import { BaseHeader, HeaderType, PacketNumber, ConnectionID } from "../header/base.header";
import { Constants } from "../../helpers/constants";
import { AEAD } from "../../crypto/aead";
import { EndpointType } from "../../quicker/type";



export class ClientCleartextPacket extends BasePacket {
    
    public constructor(header: BaseHeader) {
        super(PacketType.ClientCleartext, header);
    }

    /**
     * Method to get buffer object from a ClientCleartextPacket object
     */
    public toBuffer() {
        if (this.getHeader() === undefined) {
            throw Error("Header is not defined");
        }
        var headerBuffer = this.getHeader().toBuffer();
        
        return headerBuffer;
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