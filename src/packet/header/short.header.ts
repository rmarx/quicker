import { BaseHeader, HeaderType } from './base.header';
import { ConnectionID, PacketNumber } from './header.properties';
import { Connection } from '../../quicker/connection';
import { Bignum } from '../../types/bignum';
import { VLIE } from '../../types/vlie';


/**             0                   [1- (1 - 18)]                       *                       *
 *   +----------------------------------------------------------------------------------------------------+
 *   |0|K|1|1|0|type(3)| [dest connection ID (0/32/.../144)] | packet nr (8/16/32) |  Protected Payload(*)|
 *   +----------------------------------------------------------------------------------------------------+
 */
export class ShortHeader extends BaseHeader {
    private keyPhaseBit: boolean;
    private spinBit: boolean;
    private destConnectionID: ConnectionID;

    public constructor(type: number, destConnectionID: ConnectionID, packetNumber: PacketNumber, keyPhaseBit: boolean, spinBit: boolean) {
        super(HeaderType.ShortHeader, type, packetNumber);
        this.keyPhaseBit = keyPhaseBit;
        this.spinBit = spinBit;
        this.destConnectionID = destConnectionID;
    }

    public getKeyPhaseBit(): boolean {
        return this.keyPhaseBit;
    }

    public setKeyPhaseBit(bit: boolean) {
        this.keyPhaseBit = bit;
    }

    public getDestConnectionID(): ConnectionID {
        return this.destConnectionID;
    }

    public setDestConnectionID(connectionId: ConnectionID) {
        this.destConnectionID = connectionId;
    }

    public getSpinBit(): boolean {
        return this.spinBit;
    }

    public toBuffer(): Buffer {
        var size = this.getSize();
        var buffer = Buffer.alloc(size);
        var offset = 0;
        buffer.writeUInt8(this.getType(), offset++);
        var connectionID = this.getDestConnectionID();
        connectionID.toBuffer().copy(buffer, offset);
        offset += connectionID.getLength();
        this.getPacketNumber().getLeastSignificantBytes();
        var pn = new Bignum(this.getPacketNumber().getLeastSignificantBytes(this.getPacketNumberSize()));
        VLIE.encodePn(pn).copy(buffer, offset);
        return buffer;
    }

    public toPNEBuffer(connection: Connection, payload: Buffer): Buffer {
        var size = this.getSize();
        var buffer = Buffer.alloc(size);
        var offset = 0;
        buffer.writeUInt8(this.getType(), offset++);
        var connectionID = this.getDestConnectionID();
        connectionID.toBuffer().copy(buffer, offset);
        offset += connectionID.getLength();
        var pn = new Bignum(this.getPacketNumber().getLeastSignificantBytes());
        var encodedPn = VLIE.encodePn(pn);
        var encryptedPnBuffer = connection.getAEAD().protected1RTTPnEncrypt(encodedPn, this, payload, connection.getEndpointType());
        encryptedPnBuffer.copy(buffer, offset);
        return buffer;
    }

    private getType(): number {
        var type = this.getPacketType();
        if (this.keyPhaseBit) {
            type += 0x40;
        }
        // Since Draft-11: Third bit:  The third bit (0x20) of octet 0 is set to 1.
        type += 0x20;
        // Since Draft-10: Fourth bit:  The fourth bit (0x10) of octet 0 is set to 1.
        type += 0x10;
        
        // Since Draft-11: Sixth bit:  The sixth bit (0x04) is reserved for spinbit.
        if (this.spinBit) {
            type += 0x04;
        }

        return type;
    }

    public getSize(): number {
        var size = 1 + this.getDestConnectionID().getLength();
        size += this.getPacketNumberSize();
        return size;
    }
}

export enum ShortHeaderType {
    OneOctet = 0x0,
    TwoOctet = 0x1,
    FourOctet = 0x2
}