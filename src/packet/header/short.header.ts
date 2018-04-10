import { BaseHeader, HeaderType } from './base.header';
import { ConnectionID, PacketNumber } from './header.properties';


/**             0                   [1- (1 - 18)]                       *                       *
 *   +----------------------------------------------------------------------------------------------------+
 *   |0|K|1|1|0|type(3)| [dest connection ID (0/32/.../144)] | packet nr (8/16/32) |  Protected Payload(*)|
 *   +----------------------------------------------------------------------------------------------------+
 */
export class ShortHeader extends BaseHeader {
    private keyPhaseBit: boolean;
    private destConnectionID: ConnectionID;

    public constructor(type: number, destConnectionID: ConnectionID, packetNumber: (PacketNumber | undefined), keyPhaseBit: boolean) {
        super(HeaderType.ShortHeader, type, packetNumber);
        this.keyPhaseBit = keyPhaseBit;
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

    public toBuffer(): Buffer {
        var size = this.calculateHeaderSize();
        var buffer = Buffer.alloc(size);
        var offset = 0;
        buffer.writeUInt8(this.getType(), offset++);
        var connectionID = this.getDestConnectionID();
        connectionID.toBuffer().copy(buffer, offset);
        offset += connectionID.getLength();
        this.getPacketNumber().getLeastSignificantBits(this.getPacketNumberSize()).copy(buffer, offset);
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

        return type;
    }

    public getPacketNumberSize(): number {
        switch (this.getPacketType()) {
            case ShortHeaderType.OneOctet:
                return 1;
            case ShortHeaderType.TwoOctet:
                return 2;
        }
        return 4;
    }

    private calculateHeaderSize(): number {
        var size = 9;
        size += this.getPacketNumberSize();

        return size;
    }
}

export enum ShortHeaderType {
    OneOctet = 0x0,
    TwoOctet = 0x1,
    FourOctet = 0x2
}