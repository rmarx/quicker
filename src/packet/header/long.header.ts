import { BaseHeader, BaseProperty, ConnectionID, PacketNumber, HeaderType } from "./base.header";
import { Bignum } from "../../helpers/bignum";

/**        0              1-7                 8-12           13 - 16          17-*  
 *   +--------------------------------------------------------------------------------+
 *   |1| type(7) |  connection ID (64) |  packet nr (32) |  version(32) |  Payload(*) |
 *   +--------------------------------------------------------------------------------+
 */
export class LongHeader extends BaseHeader {
    public static readonly HEADER_SIZE: number = 17;
    private version: Version;

    public constructor(type: LongHeaderType, connectionID: ConnectionID, packetNumber: PacketNumber, version: Version) {
        super(HeaderType.LongHeader, type, connectionID, packetNumber);
        this.version = version;
    }

    public getVersion() {
        return this.version;
    }

    public setVersion(version: Version) {
        this.version = version;
    }

    public toBuffer(): Buffer {
        var buf = Buffer.alloc( LongHeader.HEADER_SIZE );
        var offset = 0;
        
        var connectionID = this.getConnectionID();
        if (connectionID === undefined) {
            throw Error("Undefined ConnectionID");
        }

        // create LongHeader
        var type = 0x80 + LongHeaderType.VersionNegotiation;
        buf.writeUInt8(type, offset++);
        connectionID.toBuffer().copy(buf, offset);
        offset += 8; // 9
        this.getPacketNumber().toBuffer().copy(buf, offset);
        offset += 4; // 13
        this.getVersion().toBuffer().copy(buf, offset);
        return buf;
    }
}

export enum LongHeaderType {
    VersionNegotiation = 0x01,
    ClientInitial = 0x02,
    ServerStatelessRetry = 0x03,
    ServerCleartext = 0x04,
    ClientCleartext = 0x05,
    Protected0RTT = 0x06
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

    public getVersion(): Bignum {
        return this.getProperty();
    }

    public setVersion(bignum: Bignum) {
        this.setProperty(bignum);
    }
}