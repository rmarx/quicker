import { BaseHeader, HeaderType } from "./base.header";
import {ConnectionID, PacketNumber, Version} from './header.properties';
import { Bignum } from "../../types/bignum";
import { Constants } from "../../utilities/constants";
import { VLIE } from "../../crypto/vlie";
import { VersionValidation } from "../../utilities/validation/version.validation";
import { Connection } from "../../quicker/connection";
import { QuickerError } from "../../utilities/errors/quicker.error";
import { QuicError } from "../../utilities/errors/connection.error";
import { ConnectionErrorCodes } from "../../utilities/errors/quic.codes";

export class VersionNegotiationHeader extends BaseHeader {
    private destConnectionID: ConnectionID;
    private srcConnectionID: ConnectionID;
    
    public constructor(type: number, destConnectionID: ConnectionID, srcConnectionID: ConnectionID) {
        super(HeaderType.VersionNegotiationHeader, type, undefined);
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

    public toBuffer(): Buffer {
        var buf = Buffer.alloc(this.getSize());
        var offset = 0;

        var type = 0x80 + this.getPacketType();
        buf.writeUInt8(type, offset++);

        offset += Buffer.from('00000000', 'hex').copy(buf, offset);

        var destLength = this.destConnectionID.getLength() === 0 ? this.destConnectionID.getLength() : this.destConnectionID.getLength() - 3;
        var srcLength = this.srcConnectionID.getLength() === 0 ? this.srcConnectionID.getLength() : this.srcConnectionID.getLength() - 3;
        buf.writeUInt8(((destLength << 4) + srcLength), offset++);

        offset += this.destConnectionID.toBuffer().copy(buf, offset);
        offset += this.srcConnectionID.toBuffer().copy(buf, offset);

        return buf;
    }    
    
    toPNEBuffer(connection: Connection, payload: Buffer): Buffer {
        throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "toPNEBuffer is not needed for version negotiation header");
    }
    
    public getSize(): number {
        // one byte for type, four bytes for version, one byte for connection ID lengths
        var size = 6;
        size += this.destConnectionID.getLength();
        size += this.srcConnectionID.getLength();
        return size;
    }



}