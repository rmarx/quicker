import { BaseHeader, ConnectionID, PacketNumber } from "./base.header";


export class ShortHeader extends BaseHeader {
    private connectionIDOmitted: boolean;
    private keyPhaseBit: boolean;

    public constructor(type: number, connectionID: (ConnectionID | undefined), packetNumber: PacketNumber, connectionIDOmitted: boolean, keyPhaseBit: boolean) {
        super(type, connectionID, packetNumber);
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