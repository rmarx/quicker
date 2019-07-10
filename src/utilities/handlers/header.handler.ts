import { Bignum } from '../../types/bignum';
import { Connection } from '../../quicker/connection';
import { BaseHeader, HeaderType } from '../../packet/header/base.header';
import { LongHeader, LongHeaderType } from '../../packet/header/long.header';
import { ShortHeader } from '../../packet/header/short.header';
import { VersionValidation } from '../validation/version.validation';
import { PartiallyParsedPacket } from '../parsers/header.parser';
import { PacketNumber, Version } from '../../packet/header/header.properties';
import { EndpointType } from '../../types/endpoint.type';
import { ConnectionErrorCodes } from '../errors/quic.codes';
import { QuicError } from '../errors/connection.error';
import { QuickerError } from '../errors/quicker.error';
import { QuickerErrorCodes } from '../errors/quicker.codes';
import { HandshakeState } from '../../crypto/qtls';
import { PacketType } from '../../packet/base.packet';
import { VLIE } from '../../types/vlie';
import { VerboseLogging } from '../logging/verbose.logging';
import { PacketLogging } from '../logging/packet.logging';
import { PacketNumberSpace } from '../../crypto/crypto.context';
import { Time } from '../../types/time';

export class HeaderHandler {

    public decryptHeader(connection: Connection, packet: PartiallyParsedPacket, encryptingEndpoint: EndpointType, receivedTime:Time): PartiallyParsedPacket | undefined {
        let header = packet.header;

        // version negotation headers do not need to be handled separately, see PacketHandler for this 
        if (header.getHeaderType() === HeaderType.VersionNegotiationHeader) {
            return packet;
        }

        // TODO: properly handle version negotation
        // we need to check if we support the QUIC version the client is attempting to use
        // if not, we need to explicitly send a version negotation message
        if (header.getHeaderType() === HeaderType.LongHeader && connection.getEndpointType() === EndpointType.Server) {
            let longHeader = <LongHeader>header;
            let negotiatedVersion = this.validateClientVersion(connection, longHeader);
            connection.setVersion(negotiatedVersion);
        }


        // We now have the necessary info in the shallowly parsed header to calculate the sampleoffset and decrypt the packet
        // at least, if the packet wasn't re-ordered and didn't arrive before we have the decryption keys! In that case, we have to buffer the packets per encryption context
        // If we can decrypt, the decryption routine just overwrites the necessary parts of the existing buffer in packet.fullContents

        let decryptedHeaderWithEncryptedPayload:PartiallyParsedPacket = packet;

        if (header.getHeaderType() === HeaderType.LongHeader) {
            let longHeader = <LongHeader>header;

            if (longHeader.getPacketType() === LongHeaderType.Protected0RTT) {
                if( !connection.getAEAD().can0RTTDecrypt(encryptingEndpoint) ) {
                    VerboseLogging.info("HeaderHandler:decryptHeader : cannot yet decrypt received 0RTT packet: buffering");
                    let ctx = connection.getEncryptionContextByHeader( header );
                    ctx!.bufferPacket( { packet: packet, connection: connection, receivedTime: receivedTime} );
                    return undefined; 
                }
                else {
                    decryptedHeaderWithEncryptedPayload.fullContents = connection.getAEAD().protected0RTTHeaderDecrypt(header, packet.fullContents);
                }
            }
            else if( longHeader.getPacketType() === LongHeaderType.Handshake ){
                if( !connection.getAEAD().canHandshakeDecrypt(encryptingEndpoint) ) {
                    VerboseLogging.info("HeaderHandler:handle : cannot yet decrypt received Handshake packet: buffering");
                    let ctx = connection.getEncryptionContextByHeader( header );
                    ctx!.bufferPacket( { packet: packet, connection: connection, receivedTime: receivedTime} );
                    return undefined; 
                }
                else {
                    decryptedHeaderWithEncryptedPayload.fullContents = connection.getAEAD().protectedHandshakeHeaderDecrypt(header, packet.fullContents, encryptingEndpoint);
                }
            } 
            else if( longHeader.getPacketType() === LongHeaderType.Initial ) {    
                decryptedHeaderWithEncryptedPayload.fullContents = connection.getAEAD().clearTextHeaderDecrypt(connection.getInitialDestConnectionID(), header, packet.fullContents, encryptingEndpoint);
            }
            else{
                VerboseLogging.error("HeaderHandler:handle unknown packetType " + longHeader.getPacketType() );
                return undefined;
            }

        } else {
            if( !connection.getAEAD().can1RTTDecrypt(encryptingEndpoint) ) {
                VerboseLogging.info("HeaderHandler:handle : cannot yet decrypt received 1RTT packet: buffering");
                let ctx = connection.getEncryptionContextByHeader( header );
                ctx!.bufferPacket( { packet: packet, connection: connection, receivedTime: receivedTime} );
                return undefined; 
            }
            else {
                decryptedHeaderWithEncryptedPayload.fullContents = connection.getAEAD().protected1RTTHeaderDecrypt(header, packet.fullContents, encryptingEndpoint);

                // keyphase is the only other used bit protected next to the pn length field, which we deal with below 
                let keyPhaseBit:boolean = (packet.fullContents[0] & 0x04) === 0x04; // 0x08 = 0b0000 0100
                (packet.header as ShortHeader).setKeyPhaseBit( keyPhaseBit );
            }
        }

        if( !decryptedHeaderWithEncryptedPayload ){
            VerboseLogging.error("HeaderHandler:handle : decryptedHeaderWithEncryptedPayload is undefined. THIS SHOULD NEVER HAPPEN!");
            return undefined;
        }

        // TODO: verify that the 2 reserved bits in the firstByte are actually 0! 


        // at this point, we have the decrypted header and encrypted payload inside packet.fullContents
        // we now calculate the actual length of the header by looking up the actual packet number length and adding that to the currently known partial header length
        // we can then also decode the truncated packet number
        // TODO: yes, we could set this value in the decryption routine as well, but we hoped to keep that a bit more loosely coupled

        // for both normal, data-carrying long and short header packets, the pn length is in the last 2 bits of the first byte
        let pnLength = packet.fullContents[0] & 0b00000011;
        pnLength += 1; // is always encoded as 1 less than the actual count, since a PN cannot be 0 bytes long

        packet.actualHeaderLength = packet.partialHeaderLength + pnLength;

        let truncatedPacketNumber = new PacketNumber(packet.fullContents.slice(packet.partialHeaderLength, packet.actualHeaderLength));

        packet.header.setTruncatedPacketNumber( truncatedPacketNumber, new PacketNumber(new Bignum(0)) ); // FIXME: properly pass largestAcked from the proper packetnumberspace here!!!

        // at this moment, packet.longHeader.payloadLength also includes the length of the packet number, so we need to remove that to get the correct payloadLength
        // this is mainly a problem if we try to re-serialize this long header later (e.g., during tests or retransmits), so it's important we do this
        if( packet.header.getHeaderType() === HeaderType.LongHeader ){
            let longHeader = packet.header as LongHeader;
            longHeader.setPayloadLength( longHeader.getPayloadLength().subtract(truncatedPacketNumber.getValue().getByteLength()) );
        }

        return packet;
    }

    public handle(connection: Connection, packet:PartiallyParsedPacket, encryptingEndpoint: EndpointType): PartiallyParsedPacket | undefined {
        let header = packet.header;

        let ctx = connection.getEncryptionContextByHeader( packet.header );
        let highestCurrentPacketNumber = false;
        if( ctx ){
            let pnSpace:PacketNumberSpace = ctx.getPacketNumberSpace();
            let DEBUGpreviousHighest:number = -1;

            // adjust remote packet number
            if (pnSpace.getHighestReceivedNumber() === undefined) {
                pnSpace.setHighestReceivedNumber(header.getPacketNumber()!);
                highestCurrentPacketNumber = true;
            } 
            else {
                let highestReceivedNumber = pnSpace.getHighestReceivedNumber() as PacketNumber;
                DEBUGpreviousHighest = highestReceivedNumber.getValue().toNumber();

                if (highestReceivedNumber.getValue().lessThan(header.getPacketNumber()!.getValue())) {
                    pnSpace.setHighestReceivedNumber( header.getPacketNumber()! );
                    highestCurrentPacketNumber = true;
                }
                else
                    VerboseLogging.error("HeaderHandler:handle : packetnr was smaller than previous highest received: RE-ORDERING not yet supported! TODO! " + header.getPacketNumber()!.getValue().toNumber() + " <= " + highestReceivedNumber.getValue().toNumber() );
            }

            VerboseLogging.info("HeaderHandler:handle : PN space \"" + ctx.getAckHandler().DEBUGname + "\" RX went from " + DEBUGpreviousHighest + " -> " + pnSpace.getHighestReceivedNumber()!.getValue().toNumber() + " (TX = " + pnSpace.DEBUGgetCurrent() + ")" );
        }

        // custom handlers for long and short headers
        //if (header.getHeaderType() === HeaderType.LongHeader) {
            //var lh = <LongHeader>header;
            //lh.setPayloadLength(lh.getPayloadLength().subtract(decodedPn.offset));
        //} else 
        if(header.getHeaderType() === HeaderType.ShortHeader){
            var sh = <ShortHeader>header; 
            this.handleShortHeader(connection, sh, highestCurrentPacketNumber);
        }
        
        return packet;
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
            let spinbit = false;

            let currentSpinbit = connection.getSpinBit();

            if( connection.getEndpointType() === EndpointType.Client ){
                spinbit = !shortHeader.getSpinBit();
            }
            else
                spinbit = shortHeader.getSpinBit();

            if( currentSpinbit != spinbit )
                connection.setSpinBit(spinbit);
        }
    }
}