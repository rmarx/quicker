import { BasePacket, PacketType } from "../base.packet";
import { Version, LongHeader, LongHeaderType } from "../header/long.header";
import { BaseHeader, HeaderType, PacketNumber, ConnectionID } from "../header/base.header";
import { Constants } from "../../helpers/constants";



export class VersionNegotiationPacket extends BasePacket {
    private versions: Version[];
    
    public constructor(header: BaseHeader, versions: Version[] = []) {
        super(PacketType.VersionNegotiation, header);
        this.versions = versions;
    }

    public getVersions(): Version[] {
        return this.versions;
    }

    public setVersions(versions: Version[]) {
        this.versions = versions;
    }

    /**
     * Method to get buffer object from a VersionNegotiationPacket object
     */
    public toBuffer() {
        if (this.getHeader() === undefined) {
            throw Error("Header is not defined");
        }
        var headerBuffer = this.getHeader().toBuffer();
        var buf = Buffer.alloc(headerBuffer.length + (Constants.SUPPORTED_VERSIONS.length * 4));
    
        headerBuffer.copy(buf, 0);
        var offset = headerBuffer.length;

        Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
            buf.write(version, offset);
            offset += 4;
        })
        return buf;
    }

    /**
     *  Method to create a Version Negotiation packet, given connectionID, packetnumber and version
     * 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public static createVersionNegotiationPacket(connectionID: ConnectionID, packetNumber: PacketNumber, version: Version) {
        var header = new LongHeader(LongHeaderType.VersionNegotiation, connectionID, packetNumber, version);
        var versions: Version[] = [];
        Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
            versions.push(new Version(Buffer.from(version, 'hex')));
        })
        return new VersionNegotiationPacket(header, versions);
    }
}