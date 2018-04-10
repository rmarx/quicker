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
        var buf = Buffer.alloc(this.getSize());
        var offset = 0;
        
        // create LongHeader
        var type = 0x80 + this.getPacketType();
        buf.writeUInt8(type, offset++);
        this.getVersion().toBuffer().copy(buf, offset);
        offset += 4;
        var destLength = this.destConnectionID.getLength() === 0 ? this.destConnectionID.getLength() : this.destConnectionID.getLength() - 3;
        var srcLength = this.srcConnectionID.getLength() === 0 ? this.srcConnectionID.getLength() : this.srcConnectionID.getLength() - 3;
        buf.writeUInt8(((destLength << 4) + srcLength), offset++);
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

    public getSize(): number {
        // one byte for type, four bytes for version, one byte for connection ID lengths
        var size = 6;
        size += this.destConnectionID.getLength();
        size += this.srcConnectionID.getLength();
        if (this.getVersion().toString() !== "00000000") {
            size += this.getPacketNumberSize();
        }
        return size;
    }
}

export enum LongHeaderType {
    Initial = 0x7F,
    Retry = 0x7E,
    Handshake = 0x7D,
    Protected0RTT = 0x7C
}