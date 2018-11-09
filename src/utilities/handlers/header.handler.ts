import { Bignum } from '../../types/bignum';
import { Connection } from '../../quicker/connection';
import { BaseHeader, HeaderType } from '../../packet/header/base.header';
import { LongHeader, LongHeaderType } from '../../packet/header/long.header';
import { ShortHeader } from '../../packet/header/short.header';
import { VersionValidation } from '../validation/version.validation';
import { HeaderOffset } from '../parsers/header.parser';
import { PacketNumber, Version } from '../../packet/header/header.properties';
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
import { PacketNumberSpace } from '../../crypto/crypto.context';

export class HeaderHandler {

    public handle(connection: Connection, headerOffset: HeaderOffset, msg: Buffer, encryptingEndpoint: EndpointType): HeaderOffset {
        var header = headerOffset.header;

        // version negotation headers do not need to be handled separately, see PacketHandler for this 
        if (header.getHeaderType() === HeaderType.VersionNegotiationHeader) {
            return {
                header: header,
                offset: headerOffset.offset
            };
        }

        // we need to check if we support the QUIC version the client is attempting to use
        // if not, we need to explicitly send a version negotation message
        if (header.getHeaderType() === HeaderType.LongHeader && connection.getEndpointType() === EndpointType.Server) {
            var longHeader = <LongHeader>header;
            var negotiatedVersion = this.validateClientVersion(connection, longHeader);
            connection.setVersion(negotiatedVersion);
        }

        var payload = msg.slice(headerOffset.offset);
        var fullPayload = Buffer.concat([header.getParsedBuffer(), payload]);
        var pne = Buffer.alloc(4);
        
        let actualPacketType:PacketType = PacketType.Initial;


        header.getParsedBuffer().copy(pne, 0, header.getParsedBuffer().byteLength - 4);
        if (header.getHeaderType() === HeaderType.LongHeader) {
            var longHeader = <LongHeader>header;
            if (longHeader.getPacketType() === LongHeaderType.Protected0RTT) {
                var decryptedPn = connection.getAEAD().protected0RTTPnDecrypt(pne, header, fullPayload, encryptingEndpoint);
                actualPacketType = PacketType.Protected0RTT;
            }
            else if( longHeader.getPacketType() === LongHeaderType.Handshake ){
                var decryptedPn = connection.getAEAD().protectedHandshakePnDecrypt(pne, header, fullPayload, encryptingEndpoint);
                actualPacketType = PacketType.Handshake;
            } 
            else {
                var decryptedPn = connection.getAEAD().clearTextPnDecrypt(connection.getInitialDestConnectionID(), pne, header, fullPayload, encryptingEndpoint);
                actualPacketType = PacketType.Initial; // TODO: FIXME: handle retry and vneg packets! (though they are also in the Initial atmosphere when it comes to pnSpace, no?)
            }
        } else {
            var decryptedPn = connection.getAEAD().protected1RTTPnDecrypt(pne, header, fullPayload, encryptingEndpoint);
            actualPacketType = PacketType.Protected1RTT;
        }

        // we first decrypted the PN, now we have the cleartext
        // however, that is then also encoded to save space in a kind-of-but-not-really VLIE scheme
        // so we need to decode the cleartext to get the actual value 

        var decodedPn = VLIE.decodePn(decryptedPn);
        header.getPacketNumber().setValue(decodedPn.value);
        headerOffset.offset = headerOffset.offset - 4 + decodedPn.offset;
        // the Associated Data (for AEAD decryption of the payload) expects the DECRYPTED pn, not the DECODED pn (we had a bug about that here before)
        // however, we only add the part of the DECRYPTED pn that actually contains the PN, for which we need to DECODE it first (decrypted is always 4 bytes, but can be 1, 2 or 4 in decoded reality)
        header.setParsedBuffer(Buffer.concat([header.getParsedBuffer().slice(0, header.getParsedBuffer().byteLength - 4), decryptedPn.slice(0, decodedPn.offset)]));

        let ctx = connection.getEncryptionContextByPacketType( actualPacketType );
        let highestCurrentPacketNumber = false;
        if( ctx ){
            let pnSpace:PacketNumberSpace = ctx.getPacketNumberSpace();
            let DEBUGpreviousHighest:number = -1;

            // adjust remote packet number
            if (pnSpace.getHighestReceivedNumber() === undefined) {
                pnSpace.setHighestReceivedNumber(header.getPacketNumber());
                highestCurrentPacketNumber = true;
            } 
            else {
                let highestReceivedNumber = pnSpace.getHighestReceivedNumber() as PacketNumber;
                DEBUGpreviousHighest = highestReceivedNumber.getValue().toNumber();

                var adjustedNumber = highestReceivedNumber.adjustNumber(header.getPacketNumber(), header.getPacketNumberSize());
                if (highestReceivedNumber.getValue().lessThan(adjustedNumber)) {
                    pnSpace.setHighestReceivedNumber( new PacketNumber(adjustedNumber) );
                    highestCurrentPacketNumber = true;
                }
                else
                    VerboseLogging.error("HeaderHandler:handle : packetnr was smaller than previous highest received: RE-ORDERING not yet supported! TODO! " + adjustedNumber.toNumber() + " <= " + highestReceivedNumber.getValue().toNumber() );

                // adjust the packet number in the header
                header.getPacketNumber().setValue(adjustedNumber);
            }

            VerboseLogging.info("HeaderHandler:handle : PN space \"" + PacketType[ actualPacketType ] + "\" RX went from " + DEBUGpreviousHighest + " -> " + pnSpace.getHighestReceivedNumber()!.getValue().toNumber() + " (TX = " + pnSpace.DEBUGgetCurrent() + ")" );
        }

        // custom handlers for long and short headers
        if (header.getHeaderType() === HeaderType.LongHeader) {
            var lh = <LongHeader>header;
            lh.setPayloadLength(lh.getPayloadLength().subtract(decodedPn.offset));
        } else if(header.getHeaderType() === HeaderType.ShortHeader){
            var sh = <ShortHeader>header; 
            this.handleShortHeader(connection, sh, highestCurrentPacketNumber);
        }
        
        return {
            header: header,
            offset: headerOffset.offset
        };
    }

    private validateClientVersion(connection: Connection, longHeader: LongHeader): Version {
        let negotiatedVersion = VersionValidation.validateVersion(connection.getVersion(), longHeader);

        if (negotiatedVersion === undefined) {
            if (longHeader.getPacketType() === LongHeaderType.Initial) {
                // It's an initial packet for which we don't have a version match: this should trigger a VersionNegotation packet
                // we do this by means of throwing an error because we don't have enough state here to handle it in this class 
                throw new QuicError(ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR, longHeader.getVersion().getValue().toString() );
            } 
            else if (longHeader.getPacketType() === LongHeaderType.Protected0RTT) {
                // TODO: #section-6.1.2 allows us to buffer 0RTT packets in anticipation of a late ClientInitial (but... 0RTTs with invalid version will still be bad right?) 
                //  -> probably primarily check that we don't trigger vneg twice or more (once in response to initial, once to 0RTT etc.) 
                throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR, "Unsupported version in 0RTT packet");
            } 
            else {
                throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "Unsupported version received in non-initial type packet : " + connection.getVersion().getValue().toString('hex') + " != " + longHeader.getVersion().toString());
            }
        }
        return negotiatedVersion;
    }
    
    private handleShortHeader(connection: Connection, shortHeader: ShortHeader, highestCurrentPacketNumber: boolean): void {
        if (highestCurrentPacketNumber) {
            var spinbit = connection.getEndpointType() === EndpointType.Client ? !shortHeader.getSpinBit() : shortHeader.getSpinBit();
            connection.setSpinBit(spinbit);
        }
    }
}