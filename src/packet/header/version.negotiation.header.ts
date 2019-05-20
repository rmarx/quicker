import { BaseHeader, HeaderType } from "./base.header";
import {ConnectionID, PacketNumber, Version} from './header.properties';
import { Bignum } from "../../types/bignum";
import { Constants } from "../../utilities/constants";
import { VLIE } from "../../types/vlie";
import { VersionValidation } from "../../utilities/validation/version.validation";
import { Connection } from "../../quicker/connection";
import { QuickerError } from "../../utilities/errors/quicker.error";
import { QuicError } from "../../utilities/errors/connection.error";
import { ConnectionErrorCodes } from "../../utilities/errors/quic.codes";

export class VersionNegotiationHeader extends BaseHeader {
    private destConnectionID: ConnectionID;
    private srcConnectionID: ConnectionID;
    
    // NOTE: the actual versions are added as payload to the VNEG packet, not as part of the "header" here 
    public constructor(destConnectionID: ConnectionID, srcConnectionID: ConnectionID) {
        // VNEG packet type is a random 7-bit number 
        super(HeaderType.VersionNegotiationHeader, Math.floor((Math.random() * 128)));
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

    public toUnencryptedBuffer(): Buffer {
        var buf = Buffer.alloc(this.getSize());
        var offset = 0;

        var type = 0x80 + this.getPacketType(); // type is 0x1yyyyyyy, where y are random digits
        buf.writeUInt8(type, offset++);

        // VNEG packet looks like Initial packet, but version is always 0
        offset += Buffer.from('00000000', 'hex').copy(buf, offset);

        // non-zero connectionIDs are always at least 4 bytes, so we can encode their lenghts in an optimized way
        let destLength = this.destConnectionID.getByteLength() === 0 ? this.destConnectionID.getByteLength() : this.destConnectionID.getByteLength() - 3;
        let srcLength  = this.srcConnectionID.getByteLength() === 0  ? this.srcConnectionID.getByteLength()  : this.srcConnectionID.getByteLength()  - 3;
        // 0xddddssss (d = destination length, s = source length)
        buf.writeUInt8(((destLength << 4) + srcLength), offset++);

        offset += this.destConnectionID.toBuffer().copy(buf, offset);
        offset += this.srcConnectionID.toBuffer().copy(buf, offset);

        return buf;
    }    
    
    public toHeaderProtectedBuffer(connection: Connection, payload: Buffer): Buffer {
        throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "toPNEBuffer is not needed for version negotiation header");
    }
    
    public getSize(): number {
        // one byte for type, four bytes for version, one byte for connection ID lengths
        var size = 6;
        size += this.destConnectionID.getByteLength();
        size += this.srcConnectionID.getByteLength();
        return size;
    }



}