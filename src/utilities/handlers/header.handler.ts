import {Bignum} from '../../types/bignum';
import {Connection} from '../../quicker/connection';
import {BaseHeader, HeaderType} from '../../packet/header/base.header';
import {LongHeader} from '../../packet/header/long.header';
import {ShortHeader} from '../../packet/header/short.header';
import { VersionValidation } from '../validation/version.validation';

export class HeaderHandler {

    public handle(connection: Connection, header: BaseHeader) {
        
        if (header.getPacketNumber() !== undefined) {
            // adjust remote packet number
            if (connection.getRemotePacketNumber() === undefined) {
                connection.setRemotePacketNumber(header.getPacketNumber());
            } else {
                connection.getRemotePacketNumber().adjustNumber(header.getPacketNumber(), header.getPacketNumberSize());
            }
        }

        // custom handlers for long and short headers
        if (header.getHeaderType() === HeaderType.LongHeader) {
            var lh = <LongHeader>header;
            this.handleLongHeader(connection, lh);
        } else {
            var sh = <ShortHeader>header;
            this.handleShortHeader(connection, sh);
        }
    }

    private handleLongHeader(connection: Connection, longHeader: LongHeader): void {
        //
    }
    private handleShortHeader(connection: Connection, shortHeader: ShortHeader): void {
        //
    }
}