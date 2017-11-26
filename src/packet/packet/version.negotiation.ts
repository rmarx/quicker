import { BasePacket, PacketType } from "../base.packet";
import { Version } from "../header/long.header";
import { BaseHeader } from "../header/base.header";



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
}