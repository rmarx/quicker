import { BaseHeader } from "./header/base.header";


export abstract class BasePacket {
    private header: BaseHeader;
    private packetType: PacketType;

    public constructor(packetType: PacketType, header: BaseHeader) {
        this.header = header;
    }


    public getHeader(): BaseHeader {
        return this.header;
    }

    public setHeader(header: BaseHeader) {
        this.header = header;
    }

    public getPacketType() {
        return this.packetType;
    }
}

// TODO add all packet types
export enum PacketType {
    VersionNegotiation
}

