import {BaseHeader, HeaderType} from './base.header';
import {ConnectionID, PacketNumber} from './header.properties';


/**           0              [1-7]                      *                       *
 *   +--------------------------------------------------------------------------------------+
 *   |0|C|K|1|0|type(3)|  [connection ID (64)] |  packet nr (8/16/32) |  Protected Payload(*) |
 *   +--------------------------------------------------------------------------------------+
 */
export class ShortHeader extends BaseHeader {
    private connectionIDOmitted: boolean;
    private keyPhaseBit: boolean;

    public constructor(type: number, connectionID: (ConnectionID | undefined), packetNumber: (PacketNumber | undefined), connectionIDOmitted: boolean, keyPhaseBit: boolean) {
        super(HeaderType.ShortHeader, type, connectionID, packetNumber);
        this.connectionIDOmitted = connectionIDOmitted;
        this.keyPhaseBit = keyPhaseBit;
    }

    public getConnectionIDOmitted(): boolean {
        return this.connectionIDOmitted;
    }

    public setConnectionIDOmitted(isOmitted: boolean) {
        this.connectionIDOmitted = isOmitted;
    }

    public getKeyPhaseBit(): boolean {
        return this.keyPhaseBit;
    }

    public setKeyPhaseBit(bit: boolean) {
        this.keyPhaseBit = bit;
    }

    public toBuffer(): Buffer {
        var size = this.getSize();
        var buffer = Buffer.alloc(size);
        var offset = 0;
        buffer.writeUInt8(this.getType(), offset++);
        if (!this.connectionIDOmitted) {
            var connectionID = this.getConnectionID();
            if (connectionID === undefined) {
                throw Error("undefined connectionID");
            }
            connectionID.toBuffer().copy(buffer, offset);
            offset += 8;
        }
        this.getPacketNumber().getLeastSignificantBits(this.getPacketNumberSize()).copy(buffer, offset);
        return buffer;
    }

    private getType(): number {
        var type = this.getPacketType();
        if (this.connectionIDOmitted) {
            type += 0x40;
        }
        if (this.keyPhaseBit) {
            type += 0x20;
        }
        // Since Draft-10: Fourth bit:  The fourth bit (0x10) of octet 0 is set to 1.
        type += 0x10;

        return type;
    }

    public getPacketNumberSize(): number {
        switch(this.getPacketType()) {
            case ShortHeaderType.OneOctet:
                return 1;
            case ShortHeaderType.TwoOctet:
                return 2;
        }
        return 4;
    }

    public getSize(): number {
        var size = 1;
        if (!this.connectionIDOmitted) {
            size += 8;
        }
        size += this.getPacketNumberSize();

        return size;
    }
}

export enum ShortHeaderType {
    OneOctet = 0x0,
    TwoOctet = 0x1,
    FourOctet = 0x2
}