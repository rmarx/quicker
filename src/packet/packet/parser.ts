import { HeaderParser } from "../header/parser";
import { BasePacket } from "../base.packet";


export class PacketParser {
    private headerParser: HeaderParser;

    public constructor() {
        this.headerParser = new HeaderParser();
    }

    public parse(msg: Buffer) {
        var header = this.headerParser.parse(msg);
    }

}