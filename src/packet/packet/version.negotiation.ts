import { BasePacket, PacketType } from "../base.packet";
import { BaseHeader } from "../header/base.header";
import { Version } from "../header/header.properties";
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

    public toBuffer(connection: Connection) {

        // each individual supported version is 4 bytes in length
        let output = Buffer.alloc( this.getSize() );
        let offset = this.getHeader().toUnencryptedBuffer().copy(output, 0);

        this.versions.forEach((version: Version) => {
            // TODO PERF: see if we can bypass the conversion to string here 
            output.write(version.getValue().toString('hex'), offset, 4, 'hex');
            offset += 4;
        });

        return output;
    }

    public getSize(): number {
        return this.getHeader().getSize() + this.versions.length * 4;
    }
}