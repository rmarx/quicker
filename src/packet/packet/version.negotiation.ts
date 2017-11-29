import { BasePacket, PacketType } from "../base.packet";
import { BaseHeader } from "../header/base.header";
import { Version } from "../header/long.header";
import { Constants } from "../../utilities/constants";
import { AEAD } from "../../crypto/aead";
import { EndpointType } from "../../quicker/type";

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
        var outOffset = headerBuffer.length;
    
        var payloadOffset = 0
        var payloadBuffer = Buffer.alloc(Constants.SUPPORTED_VERSIONS.length * 4);
        Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
            payloadBuffer.write(version, payloadOffset);
            payloadOffset += 4;
        });
        var connectionID = this.getHeader().getConnectionID();
        if (connectionID !== undefined) {
            var aead = new AEAD();
            payloadBuffer = aead.clearTextEncrypt(connectionID, payloadBuffer, EndpointType.Server);
        }
        var buf = Buffer.alloc(headerBuffer.length + payloadBuffer.length);
        headerBuffer.copy(buf, 0);
        payloadBuffer.copy(buf, outOffset)
        return buf;
    }
}