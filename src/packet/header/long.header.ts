import { BaseHeader, HeaderType } from "./base.header";
import {ConnectionID, PacketNumber, Version} from './header.properties';
import { Bignum } from "../../types/bignum";
import { Constants } from "../../utilities/constants";

/**        0              1-7                 8-12           13 - 16          17-*  
 *   +--------------------------------------------------------------------------------+
 *   |1| type(7) |  connection ID (64) |  version (32) |  packet nr (32) |  Payload(*)|
 *   +--------------------------------------------------------------------------------+
 */
export class LongHeader extends BaseHeader {
    private version: Version;
    private destConnectionID: ConnectionID;
    private srcConnectionID: ConnectionID;

    /**
     * 
     * @param type 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public constructor(type: number, destConnectionID: ConnectionID, srcConnectionID: ConnectionID, packetNumber: (PacketNumber | undefined), version: Version) {
        super(HeaderType.LongHeader, type, packetNumber);
        this.version = version;
        this.destConnectionID = destConnectionID;
        this.srcConnectionID = srcConnectionID;
    }

    public getSrcConnectionID(): ConnectionID {
        return this.srcConnectionID;
    }

    public setSrcConnectionID(connectionId: ConnectionID) {
        this.srcConnectionID = connectionId;
    }

    public getDestConnectionID(): ConnectionID {
        return this.destConnectionID;
    }

    public setDestConnectionID(connectionId: ConnectionID) {
        this.destConnectionID = connectionId;
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
        this.getVersion().toBuffer().copy(buf, offset);
        offset += 4;

        buf.writeUInt8(((this.destConnectionID.getLength() << 4) + this.srcConnectionID.getLength()), offset++);
        this.destConnectionID.toBuffer().copy(buf, offset);
        offset += this.destConnectionID.getLength();
        this.srcConnectionID.toBuffer().copy(buf, offset);
        offset += this.srcConnectionID.getLength();

        if (this.getVersion().toString() !== "00000000") {
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