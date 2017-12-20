import { BaseHeader, ConnectionID, PacketNumber, HeaderType } from "./header/base.header";
import { Version, LongHeader } from "./header/long.header";


export abstract class BasePacket {

    private header: BaseHeader;
    private packetType: PacketType;

    public constructor(packetType: PacketType, header: BaseHeader) {
        this.packetType = packetType;
        this.header = header;
    }


    public getHeader(): BaseHeader {
        return this.header;
    }

    public setHeader(header: BaseHeader) {
        this.header = header;
    }

    public getPacketType(): PacketType {
        return this.packetType;
    }

    abstract toBuffer(): Buffer;
}

export enum PacketType {
    Initial,
    Retry,
    Handshake,
    VersionNegotiation,
    Protected0RTT,
    Protected1RTT
}