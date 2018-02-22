import { BaseHeader, HeaderType } from "./base.header";
import {ConnectionID, PacketNumber, Version} from '../../types/header.properties';
import { Bignum } from "../../types/bignum";
import { Constants } from "../../utilities/constants";

/**        0              1-7                 8-12           13 - 16          17-*  
 *   +--------------------------------------------------------------------------------+
 *   |1| type(7) |  connection ID (64) |  version (32) |  packet nr (32) |  Payload(*)|
 *   +--------------------------------------------------------------------------------+
 */
export class LongHeader extends BaseHeader {
    private version: Version;

    /**
     * 
     * @param type 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public constructor(type: number, connectionID: ConnectionID, packetNumber: (PacketNumber | undefined), version: Version) {
        super(HeaderType.LongHeader, type, connectionID, packetNumber);
        this.version = version;
    }

    public getVersion(): Version {
        return this.version;
    }

    public setVersion(version: Version) {
        this.version = version;
    }

    public toBuffer(): Buffer {
        if (this.getVersion().toString() !== "00000000") {
            var buf = Buffer.alloc( Constants.LONG_HEADER_SIZE );
        } else {
            var buf = Buffer.alloc( Constants.LONG_HEADER_VN_SIZE );
        }
        var offset = 0;
        
        // create LongHeader
        var type = 0x80 + this.getPacketType();
        buf.writeUInt8(type, offset++);
        this.getConnectionID().toBuffer().copy(buf, offset);
        offset += 8; // 9
        this.getVersion().toBuffer().copy(buf, offset);
        if (this.getVersion().toString() !== "00000000") {
            offset += 4; // 13
            this.getPacketNumber().getLeastSignificantBits().copy(buf, offset);
        }
        return buf;
    }

    public getPacketNumberSize(): number {
        return Constants.LONG_HEADER_PACKET_NUMBER_SIZE;
    }
}

export enum LongHeaderType {
    Initial = 0x7F,
    Retry = 0x7E,
    Handshake = 0x7D,
    Protected0RTT = 0x7C
}