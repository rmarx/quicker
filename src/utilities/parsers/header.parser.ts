import { BasePacket, PacketType } from "../../packet/base.packet";
import { BaseHeader, HeaderType } from "../../packet/header/base.header";
import { LongHeader, LongHeaderType } from "../../packet/header/long.header";
import { ShortHeader } from "../../packet/header/short.header";
import { Constants } from "../constants";
import { ConnectionID, PacketNumber, Version } from '../../packet/header/header.properties';
import { QuicError } from "../errors/connection.error";
import { ConnectionErrorCodes } from "../errors/quic.codes";
import { VLIE } from "../../types/vlie";
import { Bignum } from "../../types/bignum";
import { VersionValidation } from "../validation/version.validation";
import { VersionNegotiationHeader } from "../../packet/header/version.negotiation.header";
import { VerboseLogging } from "../logging/verbose.logging";
import { Connection } from "../../quicker/connection";
import { EndpointType } from "../../types/endpoint.type";
import { ConnectionManager } from "../../quicker/connection.manager";


export class HeaderParser {

    /**
     * Method to shallow parse the encrypted header of a packet
     * returns a partially complete ShortHeader or LongHeader
     * @param encryptedHeaders packet buffer
     */
    public parseShallowHeader(encryptedHeaders: Buffer): PartiallyParsedPacket[] {
        let packets: Array<PartiallyParsedPacket> = [];

        let packet: PartiallyParsedPacket = this.parseHeader(encryptedHeaders, 0);
        packets.push(packet);

        //if( headerOffset.header.getHeaderType() == HeaderType.LongHeader )
        //    console.log("Done parsing first long header : ", headerOffset.offset, (<LongHeader>(headerOffset.header)).getPayloadLength().toNumber(), buf.byteLength );

        // There can be multiple QUIC packets inside a single UDP datagram, called a "compound packet"
        // https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.6


        let globalOffset: number = packet.fullContents.byteLength; // points right after the first packet
        VerboseLogging.info("HeaderParser:parseShallowHeader : after first header : " + packet.fullContents.byteLength + ". Left: " + (encryptedHeaders.byteLength - packet.fullContents.byteLength) + ", globalOffset " + globalOffset + " // full length:" + encryptedHeaders.byteLength);
        // REFACTOR TODO: second condition here should never happen, should throw error message if we encounter this! 
        while (packet.header.getHeaderType() === HeaderType.LongHeader && (<LongHeader>(packet.header)).getPayloadLength() !== undefined) {
            
            // TODO: don't we have an off-by-one error here on the offset? TEST! 
            if ( globalOffset < encryptedHeaders.byteLength ) {
                packet = this.parseHeader(encryptedHeaders, globalOffset);
                packets.push(packet);
                globalOffset += packet.fullContents.byteLength;
            } else {
                break;
            }
        }

        // Note: section 4.6 says "A packet with a short header does not include a length, so it has to be the last packet included in a UDP datagram."
        // the above while loop will account for that, but only supports a single short header packet at the end

        return packets;
    }

    private parseHeader(encryptedPackets: Buffer, offset: number): PartiallyParsedPacket {
        // All numeric values are encoded in network byte order (that is, big-endian) and all field sizes are in bits.
        // https://tools.ietf.org/html/draft-ietf-quic-transport#section-4

        // The most significant bit (0x80) of octet 0 (the first octet) is set to 1 for long headers.
        // (0x80 = 0b10000000)
        let type = encryptedPackets.readUInt8(offset); // keep offset at the start, need full first byte for later

        if ((type & 0x80) === 0x80) {
            return this.parseLongHeader(encryptedPackets, offset);
        }
        else
            return this.parseShortHeader(encryptedPackets, offset);
    }

    /** 
    * https://tools.ietf.org/html/draft-ietf-quic-transport-20#section-17.2
        0                   1                   2                   3
        0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
       +-+-+-+-+-+-+-+-+
        |1|1|T T|X X X X|
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |                         Version (32)                          |
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |DCIL(4)|SCIL(4)|
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |               Destination Connection ID (0/32..144)         ...
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |                 Source Connection ID (0/32..144)            ...
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   */
    private parseLongHeader(encryptedPackets: Buffer, offset: number): PartiallyParsedPacket {

        let startOffset = offset;

        // We do a shallow parse here: only parse the non-encrypted elements in the header
        // the encrypted elements are parsed later, see HeaderHandler
        let firstByte = (encryptedPackets.readUInt8(offset++) - 0xC0); // -0xC0 to remove first 2 bytes (otherwhise, bitwise operators are wonky in JS)

        let type = firstByte >> 4; // with the highest 2 bits removed above, we just drop the 4 rightmost ones to just keep the 2 type bits

        VerboseLogging.debug("HeaderParser:parseLongHeader: type " + type + " // " + LongHeaderType[type] );

        if( type === LongHeaderType.Retry ){
            VerboseLogging.error("headerParser:parseLongHeader : parsing a Retry packet, isn't supported yet! (ODCIL length in first byte)");
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "Retry could not be parsed, not supported yet");
        }

        let version = new Version(encryptedPackets.slice(offset, offset + 4)); // version is 4 bytes
        offset += 4;

        if (VersionValidation.IsVersionNegotationFlag(version)) {
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "headerparser:parseLongHeader : version negotiation not supported yet!");
            //return this.parseVersionNegotiationHeader(encryptedPackets, offset, type);
        }

        let conLengths = encryptedPackets.readUInt8(offset++); // single byte containing both ConnectionID lengths DCIL and SCIL 
        // VERIFY TODO: connectionIDs can be empty if the other party can choose them freely
        // connection-id length encoding: we want to encode variable lengths for the Connection IDs of 4 to 18 bytes
        // to save space, we cram this info into 4 bits. Normally, they can only hold 0-15 as values, but because minimum length is 4, we can just do +3 to get the real value
        let dcil = conLengths >> 4; // drop the 4 rightmost bits 
        dcil = dcil === 0 ? dcil : dcil + 3;
        let scil = conLengths & 0b00001111;  
        scil = scil === 0 ? scil : scil + 3;


        let destConnectionID = new ConnectionID(encryptedPackets.slice(offset, offset + dcil), dcil);
        offset += dcil;
        let srcConnectionID = new ConnectionID(encryptedPackets.slice(offset, offset + scil), scil);
        offset += scil;
        
        let tokens:Buffer|undefined = undefined;
        if( type == LongHeaderType.Initial ){

            let tokenLength:Bignum = new Bignum(0);
            // draft-13 added a token in the Initial packet, after the SCID
            // https://tools.ietf.org/html/draft-ietf-quic-transport-13#section-4.4.1
            // TODO: FIXME: actually add these to LongHeader packet, now just done for quick parsing fixing
            let oldOffset = offset;
            let tokenLengthV = VLIE.decode(encryptedPackets, offset);
            tokenLength = tokenLengthV.value;
            offset = tokenLengthV.offset;
            
            if( tokenLengthV.value.toNumber() > 0 ){
                tokens = Buffer.alloc(tokenLength.toNumber());
                encryptedPackets.copy(tokens, 0, offset, offset + tokenLength.toNumber());
                offset += tokenLengthV.value.toNumber();
                VerboseLogging.warn("---------------------------------------------");
                VerboseLogging.warn("WARNING: HeaderParser:Initial packet contained reset token, this code is not yet tested, can break! " + tokens.byteLength + " // " + tokens);
                VerboseLogging.warn("---------------------------------------------");
            }
        }

        let restLengthV = VLIE.decode(encryptedPackets, offset);
        let restLength = restLengthV.value;
        let restLengthBuffer = Buffer.alloc(restLengthV.offset - offset);
        encryptedPackets.copy(restLengthBuffer, 0, offset, restLengthV.offset);
        offset = restLengthV.offset;

        let header = new LongHeader(type, destConnectionID, srcConnectionID, restLength, version, restLengthBuffer);
        if( tokens )
            header.setInitialTokens(tokens); // also sets initial length  

        if( offset + restLength.toNumber() > encryptedPackets.byteLength ){
            VerboseLogging.error("HeaderParser:parseLongHeader : encrypted packet end is past the end of the current buffer! " + (offset + restLength.toNumber()) + " > " + encryptedPackets.byteLength );
            throw new QuicError(ConnectionErrorCodes.FINAL_OFFSET_ERROR, "packet must have been truncated somehow. Currently not dealing with this properly yet!");
        }

        let restLengthNumber = restLength.toNumber();
        // the offset is now right behind the "length" field, so EXCLUDING the packet number and the payload
        // adding the restLength to it gives us the end of the packet
        // NOTE: we are copying the data here instead of just keeping it in a single buffer
        // this MIGHT give less performance, but is way easier to interpret + this only happens for long header packets, which is only at the start of the connection
        return {
            fullContents: encryptedPackets.slice(startOffset, offset + restLengthNumber),
            partialHeaderLength: offset - startOffset,
            restLength: restLengthNumber,
            header: header,

            actualHeaderLength: undefined // not known yet, only known after header decryption
        };
    }

    /*
    private parseVersionNegotiationHeader(encryptedPacket: Buffer, offset: number, type: number): PartiallyParsedPacket {
        
        
    }
    */

    /** 
     * https://tools.ietf.org/html/draft-ietf-quic-transport-20#section-17.3  
         0                   1                   2                   3
         0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
        +-+-+-+-+-+-+-+-+
        |0|1|S|R|R|K|P P|
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
        |                Destination Connection ID (0..144)           ...
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
        |                     Packet Number (8/16/24/32)              ...
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
        |                     Protected Payload (*)                   ...
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+*/
    private parseShortHeader(encryptedPacket: Buffer, offset: number): PartiallyParsedPacket {
        let startOffset = offset; // measured in bytes

        let firstByte = (encryptedPacket.readUInt8(offset++) - 0x40); // -0x40 : remove the 0x01 at the start 

        // 3 = 0x20 = spinbit
        // 4 and 5 = 0x18 = reserved
        // 6 = 0x04 = keyphase
        // 7 and 8 = 0x03 = pn length

        let spinBit:boolean     = (firstByte & 0x20) === 0x20; // 0x20 = 0b0010 0000
        //let reserved1:boolean   = (firstByte & 0x10) === 0x10; // 0x10 = 0b0001 0000
        //let reserved2:boolean   = (firstByte & 0x08) === 0x08; // 0x08 = 0b0000 1000
        //let keyPhaseBit:boolean = (firstByte & 0x04) === 0x04; // 0x08 = 0b0000 0100

        //let pnLength:number     = firstByte & 0b00000011;
        //pnLength += 1;  // is always encoded as 1 less than the actual count, since a PN cannot be 0 bytes long

        // TODO: check that reserved1 and reserved2 are both 0 AFTER removing header protection


        // The destination connection ID is either length 0 or between 4 and 18 bytes long
        // There is no set way of encoding this, we are completely free to choose this ourselves.
        // This is a consequence of the split between Source and Destination Connection IDs
        // For receiving packets, we are the "destination" and we have chosen this ConnID ourselves during connection setup, so we are free to dictate its format
        // For now, we just include an 8-bit length up-front and then decode the rest based on that (see ConnectionID:randomConnectionID)
        // REFACTOR TODO: we currently do not support a 0-length connection ID with our scheme! 
        // REFACTOR TODO: use something like ConnectionID.fromBuffer() here, so that custom logic is isolated in one area 
        let dcil = encryptedPacket.readUInt8(offset);
        let destConIDBuffer = Buffer.alloc(dcil);
        encryptedPacket.copy(destConIDBuffer, 0, offset, offset + dcil);

        let destConnectionID = new ConnectionID(destConIDBuffer, dcil);
        offset += dcil;


        //let truncatedPacketNumber = new PacketNumber(encryptedPacket.slice(offset, offset + pnLength));
        //offset = offset + pnLength;

        let header = new ShortHeader(destConnectionID, false, spinBit);
        //header.setTruncatedPacketNumber( truncatedPacketNumber, new PacketNumber(new Bignum(0)) ); // FIXME: properly pass largestAcked here!!! 

        //let parsedBuffer = encryptedPacket.slice(startOffset, offset);
        //header.setParsedBuffer(parsedBuffer);

        let restLength = encryptedPacket.byteLength - offset;

        VerboseLogging.info("HeaderParser:parseShortHeader 0x" + firstByte.toString(16) + ", " + destConnectionID.toBuffer().toString('hex') + " -> rest " + restLength + " started at : " + startOffset + ", now at " + offset + " // total Length : " + encryptedPacket.byteLength);
 
        // the offset is now right behind the "length" field, so EXCLUDING the packet number and the payload
        // adding the restLength to it gives us the end of the packet
        // NOTE: we are copying the data here instead of just keeping it in a single buffer
        // this MIGHT give less performance, but is way easier to interpret + this only happens for long header packets, which is only at the start of the connection
        return {
            fullContents: encryptedPacket.slice(startOffset, offset + restLength), 
            partialHeaderLength: offset - startOffset,
            restLength: restLength,
            header: header,

            actualHeaderLength: undefined // not known yet, only known after header decryption
        };
    }
}

export interface PartiallyParsedPacket {
    fullContents: Buffer,
    header: BaseHeader,
    partialHeaderLength: number, // for most long header packets: points right behind the "length" field: do partialHeaderLength + restLength to get the end of the packet. For short header: points to right after the DCID
    restLength: number,

    actualHeaderLength:number|undefined
}

/*
export interface HeaderOffset {
    header: BaseHeader,
    offset: number // for most long header packets: points right behind the "length" field: do offset + header.getPayloadLength() to get the end of the packet. For short header: points to right after the DCID
}
*/