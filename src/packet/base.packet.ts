import { BaseHeader } from "./header/base.header";


export abstract class BasePacket {
    // TODO
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
}