import { BaseHeader, ConnectionID, PacketNumber, HeaderType } from "./header/base.header";
import { Version, LongHeader } from "./header/long.header";


export abstract class BasePacket {
    private header: BaseHeader;

    public constructor(header: BaseHeader) {
        this.header = header;
    }


    public getHeader(): BaseHeader {
        return this.header;
    }

    public setHeader(header: BaseHeader) {
        this.header = header;
    }

    abstract toBuffer(): Buffer;
}

