import {Bignum} from '../../types/bignum';
import {Connection} from '../../quicker/connection';
import {BaseHeader, HeaderType} from '../../packet/header/base.header';
import {LongHeader} from '../../packet/header/long.header';
import {ShortHeader} from '../../packet/header/short.header';
import { VersionValidation } from '../validation/version.validation';
import { HeaderOffset } from '../parsers/header.parser';
import { PacketNumber } from '../../packet/header/header.properties';

export class HeaderHandler {

    public handle(connection: Connection, headerOffset: HeaderOffset): HeaderOffset {
        var header = headerOffset.header;
        if (header.getPacketNumber() !== undefined) {
            // adjust remote packet number
            if (connection.getRemotePacketNumber() === undefined) {
                connection.setRemotePacketNumber(header.getPacketNumber());
            } else {
                var adjustedNumber = connection.getRemotePacketNumber().adjustNumber(header.getPacketNumber(), header.getPacketNumberSize());
                if (connection.getRemotePacketNumber().getPacketNumber().lessThan(adjustedNumber)) {
                    connection.getRemotePacketNumber().setPacketNumber(adjustedNumber);
                }
                // adjust the packet number in the header
                header.getPacketNumber().setPacketNumber(adjustedNumber);
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
        return {
            header: header, 
            offset: headerOffset.offset
        };
    }

    private handleLongHeader(connection: Connection, longHeader: LongHeader): void {
        //
    }
    private handleShortHeader(connection: Connection, shortHeader: ShortHeader): void {
        //
    }
}