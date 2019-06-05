import {Connection} from '../quicker/connection';
import {BaseHeader} from './header/base.header';
import { LongHeader } from "./header/long.header";
import { PacketNumber } from './header/header.properties';



export abstract class BasePacket {

    public DEBUG_wasRetransmitted:boolean = false;
    public DEBUG_originalPacketNumber!:PacketNumber;

    private header: BaseHeader;
    private packetType: PacketType;

    protected retransmittable: boolean;
    protected ackOnly: boolean;
    protected paddingOnly: boolean;

    protected bufferedLength: number;

    public constructor(packetType: PacketType, header: BaseHeader) {
        this.packetType = packetType;
        this.header = header;
        this.retransmittable = false;
        this.ackOnly = true;
        this.paddingOnly = true;

        this.bufferedLength = -1;
    }


    public getHeader(): BaseHeader {
        return this.header;
    }

    /*
    public setHeader(header: BaseHeader) {
        this.header = header;
    }
    */

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
        return this.ackOnly;
    }

    public isPaddingOnly():boolean {
        return this.paddingOnly;
    }

    abstract getSize(): number;
    abstract toBuffer(connection: Connection): Buffer;

    public getBufferedByteLength():number{
        return this.bufferedLength;
    }
}

export enum PacketType {
    Initial,
    Retry,
    Handshake,
    VersionNegotiation,
    Protected0RTT,
    Protected1RTT,
    UNKNOWN
}