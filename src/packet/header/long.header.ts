import { BaseHeader, HeaderType } from "./base.header";
import {ConnectionID, PacketNumber, Version} from './header.properties';
import { Bignum } from "../../types/bignum";
import { Constants } from "../../utilities/constants";
import { VLIE } from "../../crypto/vlie";

/**        0              1-7                 8-12           13 - 16          17-*  
 *   +--------------------------------------------------------------------------------+
 *   |1| type(7) |  connection ID (64) |  version (32) |  packet nr (32) |  Payload(*)|
 *   +--------------------------------------------------------------------------------+
 */
export class LongHeader extends BaseHeader {
    private version: Version;
    private destConnectionID: ConnectionID;
    private srcConnectionID: ConnectionID;
    private payloadLength: Bignum | undefined;

    /**
     * 
     * @param type 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public constructor(type: number, destConnectionID: ConnectionID, srcConnectionID: ConnectionID, packetNumber: (PacketNumber | undefined), payloadLength: (Bignum | undefined) ,version: Version) {
        super(HeaderType.LongHeader, type, packetNumber);
        this.version = version;
        this.destConnectionID = destConnectionID;
        this.srcConnectionID = srcConnectionID;
        this.payloadLength = payloadLength;
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

    public getPayloadLength(): Bignum | undefined {
        return this.payloadLength;
    }

    public setPayloadLength(value: number): void;
    public setPayloadLength(value: Bignum): void;
    public setPayloadLength(value: any): void {
        if (value instanceof Bignum) {
            this.payloadLength = value;
            return;
        }
        this.payloadLength = new Bignum(value);
    }

    public toBuffer(): Buffer {
        var buf = Buffer.alloc(this.getSize());
        var offset = 0;
        
        // create LongHeader
        var type = 0x80 + this.getPacketType();
        buf.writeUInt8(type, offset++);
        offset += this.getVersion().toBuffer().copy(buf, offset);
        var destLength = this.destConnectionID.getLength() === 0 ? this.destConnectionID.getLength() : this.destConnectionID.getLength() - 3;
        var srcLength = this.srcConnectionID.getLength() === 0 ? this.srcConnectionID.getLength() : this.srcConnectionID.getLength() - 3;
        buf.writeUInt8(((destLength << 4) + srcLength), offset++);
        offset += this.destConnectionID.toBuffer().copy(buf, offset);
        offset += this.srcConnectionID.toBuffer().copy(buf, offset);

        if (this.getVersion().toString() !== "00000000") {
            if (this.payloadLength !== undefined) {
                var payloadLengthBuffer = VLIE.encode(this.payloadLength);
                offset += payloadLengthBuffer.copy(buf, offset);
            }
            offset += this.getPacketNumber().getLeastSignificantBits().copy(buf, offset);
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
        if (this.payloadLength !== undefined) {
            size += VLIE.encode(this.payloadLength).byteLength;
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