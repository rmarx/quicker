import { BasePacket, PacketType } from "../base.packet";
import { BaseHeader } from "../header/base.header";
import { Version } from "../header/header.properties";
import { Constants } from "../../utilities/constants";
import { EndpointType } from "../../types/endpoint.type";
import { Connection } from "../../quicker/connection";

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
    public toBuffer(connection: Connection) {
    
        var payloadOffset = 0
        var payloadBuffer = Buffer.alloc(Constants.SUPPORTED_VERSIONS.length * 4);
        Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
            payloadBuffer.write(version, payloadOffset, 4, 'hex');
            payloadOffset += 4;
        });

        var headerBuffer = this.getHeader().toBuffer();
        var outOffset = headerBuffer.length;

        var buf = Buffer.alloc(headerBuffer.length + payloadBuffer.length);
        headerBuffer.copy(buf, 0);
        payloadBuffer.copy(buf, outOffset)
        return buf;
    }

    public getSize(): number {
        return this.getHeader().getSize() + this.versions.length * 4;
    }
}