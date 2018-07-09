import { Bignum } from '../../types/bignum';
import { Connection } from '../../quicker/connection';
import { BaseHeader, HeaderType } from '../../packet/header/base.header';
import { LongHeader, LongHeaderType } from '../../packet/header/long.header';
import { ShortHeader } from '../../packet/header/short.header';
import { VersionValidation } from '../validation/version.validation';
import { HeaderOffset } from '../parsers/header.parser';
import { PacketNumber } from '../../packet/header/header.properties';
import { EndpointType } from '../../types/endpoint.type';
import { ConnectionErrorCodes } from '../errors/quic.codes';
import { QuicError } from '../errors/connection.error';
import { QuickerError } from '../errors/quicker.error';
import { QuickerErrorCodes } from '../errors/quicker.codes';
import { HandshakeState } from '../../crypto/qtls';
import { PacketType } from '../../packet/base.packet';
import { VLIE } from '../../crypto/vlie';
import { VerboseLogging } from '../logging/verbose.logging';
import { PacketLogging } from '../logging/packet.logging';

export class HeaderHandler {

    public handle(connection: Connection, headerOffset: HeaderOffset, msg: Buffer, encryptingEndpoint: EndpointType): HeaderOffset {
        var header = headerOffset.header;
        var highestCurrentPacketNumber = false;

        // we need to check if we support the QUIC version the client is attempting to use
        // if not, we need to explicitly send a version negotation message
        if (header.getHeaderType() === HeaderType.LongHeader && connection.getEndpointType() === EndpointType.Server) {
            var longHeader = <LongHeader>header;
            var negotiatedVersion = VersionValidation.validateVersion(connection.getVersion(), longHeader);
            if (negotiatedVersion === undefined) {
                if (header.getPacketType() === LongHeaderType.Initial) {
                    connection.resetConnectionState();
                    throw new QuicError(ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR);
                } else if (header.getPacketType() === LongHeaderType.Protected0RTT || connection.getQuicTLS().getHandshakeState() === HandshakeState.SERVER_HELLO) {
                    // Protected0RTT is if the client's early data is being sent along with the Initial
                    // SERVER_HELLO is starting state of the server: basically an "allow all as long as we're starting the handshake"
                    // VERIFY TODO: is this correct? and, if yes, do we need the Protected0RTT check, as it wil arrive during SERVER_HELLO? 
                    // TODO: #section-6.1.2 allows us to buffer 0RTT packets in anticipation of a late ClientInitial 
                    throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR);
                } else {
                    throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "Unsupported version received in non-initial type packet");
                }
            }
            connection.setVersion(negotiatedVersion);
        }
        if (header.getPacketNumber() === undefined) {
            return {
                header: header,
                offset: headerOffset.offset
            };
        }

        var payload = msg.slice(headerOffset.offset);
        var fullPayload = Buffer.concat([header.getParsedBuffer(), payload]);
        var pne = Buffer.alloc(4);
        header.getParsedBuffer().copy(pne, 0, header.getParsedBuffer().byteLength - 4);
        if (header.getHeaderType() === HeaderType.LongHeader) {
            var longHeader = <LongHeader>header;
            if (longHeader.getPacketType() === LongHeaderType.Protected0RTT) {
                var pn = connection.getAEAD().protected0RTTPnDecrypt(pne, header, fullPayload, encryptingEndpoint);
            } else {
                var pn = connection.getAEAD().clearTextPnDecrypt(connection.getInitialDestConnectionID(), pne, header, fullPayload, encryptingEndpoint);
            }
        } else {
            var pn = connection.getAEAD().protected1RTTPnDecrypt(pne, header, fullPayload, encryptingEndpoint);
        }
        var decodedPnVlieOffset = VLIE.decodePn(pn);
        header.getPacketNumber().setValue(decodedPnVlieOffset.value);
        headerOffset.offset = headerOffset.offset - 4 + decodedPnVlieOffset.offset;
        header.setParsedBuffer(Buffer.concat([header.getParsedBuffer().slice(0, header.getParsedBuffer().byteLength - 4), decodedPnVlieOffset.value.toBuffer(decodedPnVlieOffset.offset)]));

        // adjust remote packet number
        if (connection.getRemotePacketNumber() === undefined) {
            connection.setRemotePacketNumber(header.getPacketNumber());
            highestCurrentPacketNumber = true;
        } else {
            var adjustedNumber = connection.getRemotePacketNumber().adjustNumber(header.getPacketNumber(), header.getPacketNumberSize());
            if (connection.getRemotePacketNumber().getValue().lessThan(adjustedNumber)) {
                connection.getRemotePacketNumber().setValue(adjustedNumber);
                highestCurrentPacketNumber = true;
            }
            // adjust the packet number in the header
            header.getPacketNumber().setValue(adjustedNumber);
        }

        // custom handlers for long and short headers
        if (header.getHeaderType() === HeaderType.LongHeader) {
            var lh = <LongHeader>header;
            var payloadlength = lh.getPayloadLength();
            if (payloadlength !== undefined) {
                lh.setPayloadLength(payloadlength.subtract(decodedPnVlieOffset.offset));
            }
            this.handleLongHeader(connection, lh, highestCurrentPacketNumber);
        } else {
            var sh = <ShortHeader>header;
            this.handleShortHeader(connection, sh, highestCurrentPacketNumber);
        }
        return {
            header: header,
            offset: headerOffset.offset
        };
    }

    private handleLongHeader(connection: Connection, longHeader: LongHeader, highestCurrentPacketNumber: boolean): void {
        //
    }
    private handleShortHeader(connection: Connection, shortHeader: ShortHeader, highestCurrentPacketNumber: boolean): void {
        if (highestCurrentPacketNumber) {
            var spinbit = connection.getEndpointType() === EndpointType.Client ? !shortHeader.getSpinBit() : shortHeader.getSpinBit();
            connection.setSpinBit(spinbit);
        }
    }
}