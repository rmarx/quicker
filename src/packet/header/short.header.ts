import { BaseHeader, ConnectionID, PacketNumber, HeaderType } from "./base.header";

/**           0              [1-7]                      *                       *
 *   +--------------------------------------------------------------------------------------+
 *   |0|C|K| type(5) |  [connection ID (64)] |  packet nr (8/16/32) |  Protected Payload(*) |
 *   +--------------------------------------------------------------------------------------+
 */
export class ShortHeader extends BaseHeader {
    private connectionIDOmitted: boolean;
    private keyPhaseBit: boolean;

    public constructor(type: number, connectionID: (ConnectionID | undefined), packetNumber: PacketNumber, connectionIDOmitted: boolean, keyPhaseBit: boolean) {
        super(HeaderType.LongHeader, type, connectionID, packetNumber);
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
}