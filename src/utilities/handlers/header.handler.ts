import {Bignum} from '../../types/bignum';
import {Connection} from '../../quicker/connection';
import {BaseHeader, HeaderType} from '../../packet/header/base.header';
import {LongHeader, LongHeaderType} from '../../packet/header/long.header';
import {ShortHeader} from '../../packet/header/short.header';
import { VersionValidation } from '../validation/version.validation';
import { HeaderOffset } from '../parsers/header.parser';
import { PacketNumber } from '../../packet/header/header.properties';
import { EndpointType } from '../../types/endpoint.type';
import { ConnectionErrorCodes } from '../errors/quic.codes';
import { QuicError } from '../errors/connection.error';

export class HeaderHandler {

    public handle(connection: Connection, headerOffset: HeaderOffset): HeaderOffset {
        var header = headerOffset.header;

        if (header.getHeaderType() === HeaderType.LongHeader && connection.getEndpointType() === EndpointType.Server) {
            var longHeader = <LongHeader>header;
            var negotiatedVersion = VersionValidation.validateVersion(connection.getVersion(), longHeader);
            if (negotiatedVersion === undefined) {
                if (header.getPacketType() === LongHeaderType.Initial) {
                    connection.resetConnectionState();
                    throw new QuicError(ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR);
                } else {
                    throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION);
                }
            }
            connection.setVersion(negotiatedVersion);
        }
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