import { BaseHeader, BaseProperty, ConnectionID, PacketNumber } from "./base.header";


export class LongHeader extends BaseHeader {
    private version: Version;

    public constructor(type: number, connectionID: ConnectionID, packetNumber: PacketNumber, version: Version) {
        super(type, connectionID, packetNumber);
        this.version = version;
    }

    public getVersion() {
        return this.version;
    }

    public setVersion(version: Version) {
        this.version = version;
    }
}

export class Version extends BaseProperty {
    
    public constructor(buffer: Buffer) {
        // Buffer need to be length 4 because version is 32 bits long
        if (buffer.length !== 4) {
            // TODO: throw error
            return;
        }
        super(buffer);
    }

    public getVersion(): Buffer {
        return this.getProperty();
    }

    public setVersion(buffer: Buffer) {
        this.setProperty(buffer);
    }
}