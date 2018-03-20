import {Connection} from '../quicker/connection';
import {BaseHeader} from './header/base.header';
import { LongHeader } from "./header/long.header";



export abstract class BasePacket {

    private header: BaseHeader;
    private packetType: PacketType;

    protected retransmittable: boolean;

    public constructor(packetType: PacketType, header: BaseHeader) {
        this.packetType = packetType;
        this.header = header;
        this.retransmittable = false;
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

    public isHandshake(): boolean {
        return (this.packetType === PacketType.Initial || this.packetType === PacketType.Handshake);
    }

    public isRetransmittable(): boolean {
        return this.retransmittable;
    }

    public isAckOnly(): boolean {
        return !this.retransmittable;
    }

    abstract toBuffer(connection: Connection): Buffer;
}

export enum PacketType {
    Initial,
    Retry,
    Handshake,
    VersionNegotiation,
    Protected0RTT,
    Protected1RTT
}