import { BaseHeader, HeaderType } from "./base.header";
import { LongHeader } from "./long.header";
import { ShortHeader } from "./short.header";
import { Connection } from "./../../types/connection";

export class HeaderHandler {

    public handle(connection: Connection, header: BaseHeader) {
        if (header.getHeaderType() === HeaderType.LongHeader) {
            var lh = <LongHeader>header;
            this.handleLongHeader(connection, lh);
        } else {
            var sh = <ShortHeader>header;
            this.handleShortHeader(connection, sh);
        }
    }

    private handleLongHeader(connection: Connection, longHeader: LongHeader): void {
        
    }
    private handleShortHeader(connection: Connection, shortHeader: ShortHeader): void {
        throw new Error("Method not implemented.");
    }
}