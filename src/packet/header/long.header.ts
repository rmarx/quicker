import { BaseHeader, BaseProperty, ConnectionID, PacketNumber, HeaderType } from "./base.header";
import { Bignum } from "../../utilities/bignum";
import { Constants } from "../../utilities/constants";

/**        0              1-7                 8-12           13 - 16          17-*  
 *   +--------------------------------------------------------------------------------+
 *   |1| type(7) |  connection ID (64) |  version (32) |  packet nr (32) |  Payload(*)|
 *   +--------------------------------------------------------------------------------+
 */
export class LongHeader extends BaseHeader {
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
        var buf = Buffer.alloc( Constants.LONG_HEADER_SIZE );
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
        this.getPacketNumber().getLeastSignificantBits().copy(buf, offset);
        offset += 4; // 13
        this.getVersion().toBuffer().copy(buf, offset);
        return buf;
    }
}

export enum LongHeaderType {
    VersionNegotiation = 0x7F,
    Initial = 0x7E,
    Retry = 0x7D,
    Handshake = 0x7C,
    Protected0RTT = 0x7B
}

export class Version extends BaseProperty {
    
    public constructor(buffer: Buffer) {
        super(buffer);
    }

    public getVersion(): Bignum {
        return this.getProperty();
    }

    public setVersion(bignum: Bignum) {
        this.setProperty(bignum);
    }
}