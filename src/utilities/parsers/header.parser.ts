import { BasePacket, PacketType } from "../../packet/base.packet";
import { BaseHeader, HeaderType } from "../../packet/header/base.header";
import { LongHeader, LongHeaderType } from "../../packet/header/long.header";
import { ShortHeader, ShortHeaderType } from "../../packet/header/short.header";
import { Constants } from "../constants";
import { ConnectionID, PacketNumber, Version } from '../../packet/header/header.properties';
import { QuicError } from "../errors/connection.error";
import { ConnectionErrorCodes } from "../errors/quic.codes";
import { VLIE } from "../../crypto/vlie";
import { Bignum } from "../../types/bignum";
import { VersionValidation } from "../validation/version.validation";
import { VersionNegotiationHeader } from "../../packet/header/version.negotiation.header";


export class HeaderParser {

    /**
     * Method to parse the header of a packet
     * returns a ShortHeader or LongHeader, depending on the first bit
     * @param buf packet buffer
     */
    public parse(buf: Buffer): HeaderOffset[] {
        var headerOffsets: HeaderOffset[] = [];

        var headerOffset: HeaderOffset = this.parseHeader(buf, 0);
        headerOffsets.push(headerOffset);

        //if( headerOffset.header.getHeaderType() == HeaderType.LongHeader )
        //    console.log("Done parsing first long header : ", headerOffset.offset, (<LongHeader>(headerOffset.header)).getPayloadLength().toNumber(), buf.byteLength );

        // There can be multiple QUIC packets inside a single UDP datagram, called a "compound packet"
        // https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.6
        var totalSize: Bignum = new Bignum(0); // REFACTOR TODO: why is this a Bignum? headers can't be that large if they fit inside a UDP packet? 
        // REFACTOR TODO: second condition here should never happen, should throw error message if we encounter this! 
        while (headerOffset.header.getHeaderType() === HeaderType.LongHeader && (<LongHeader>(headerOffset.header)).getPayloadLength() !== undefined) {
            var longHeader: LongHeader = <LongHeader>(headerOffset.header);
            var payloadLength = longHeader.getPayloadLength();

            // REFACTOR TODO: this is a bit of an awkward way to calculate if we still have bytes to process... can't this be done more easily?
            var headerSize = new Bignum(headerOffset.offset).subtract(totalSize);
            totalSize = totalSize.add(payloadLength).add(headerSize);
            if (totalSize.lessThan(buf.byteLength)) {
                console.log("We have something left, parsing next header", totalSize.toNumber(), buf.byteLength);
                headerOffset = this.parseHeader(buf, totalSize.toNumber());
                headerOffsets.push(headerOffset);
            } else {
                break;
            }
        }

        // Note: section 4.6 says "A packet with a short header does not include a length, so it has to be the last packet included in a UDP datagram."
        // the above while loop will account for that, but only supports a single short header packet at the end

        return headerOffsets;
    }

    private parseHeader(buf: Buffer, offset: number): HeaderOffset {
        // All numeric values are encoded in network byte order (that is, big-endian) and all field sizes are in bits.
        // https://tools.ietf.org/html/draft-ietf-quic-transport#section-4

        // The most significant bit (0x80) of octet 0 (the first octet) is set to 1 for long headers.
        // (0x80 = 0b10000000)
        // https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.1
        var type = buf.readUInt8(offset);

        if ((type & 0x80) === 0x80) {
            return this.parseLongHeader(buf, offset);
        }

        return this.parseShortHeader(buf, offset);
    }

    /** 
    * https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.1
       0                   1                   2                   3
       0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
       +-+-+-+-+-+-+-+-+
       |1|   Type (7)  |
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |                         Version (32)                          |
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |DCIL(4)|SCIL(4)|
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |               Destination Connection ID (0/32..144)         ...
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |                 Source Connection ID (0/32..144)            ...
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |                       Payload Length (i)                    ...
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |                       Packet Number (32)                      |
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       |                          Payload (*)                        ...
       +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   */
    /**
     *  Method to parse the Long header of a packet
     * 
     * @param buf packet buffer
     */
    private parseLongHeader(buf: Buffer, offset: number): HeaderOffset {
        var startOffset = offset; // measured in bytes
        var type = (buf.readUInt8(offset++) - 0x80); // 0x80 to negate header type, see :parseHeader

        var version = new Version(buf.slice(offset, offset + 4)); // version is 4 bytes
        offset += 4;

        if (VersionValidation.IsVersionNegotationFlag(version)) {
            return this.parseVersionNegotiationHeader(buf, offset, type);
        }

        var conLengths = buf.readUInt8(offset++); // single byte containing both ConnectionID lengths DCIL and SCIL 
        // VERIFY TODO: connectionIDs can be empty if the other party can choose them freely
        var destLength = conLengths >> 4; // the 4 leftmost bits are the DCIL 
        destLength = destLength === 0 ? destLength : destLength + 3;
        var srcLength = conLengths & 0xF; // 0xF = 0b1111, so we keep just the 4 rightmost bits 
        srcLength = srcLength === 0 ? srcLength : srcLength + 3;

        // NOTE for above: we want to encode variable lengths for the Connection IDs of 4 to 18 bytes
        // to save space, we cram this info into 4 bits. Normally, they can only hold 0-15 as values, but because minimum length is 4, we can just do +3 to get the real value

        var destConnectionID = new ConnectionID(buf.slice(offset, offset + destLength), destLength);
        offset += destLength;
        var srcConnectionID = new ConnectionID(buf.slice(offset, offset + srcLength), srcLength);
        offset += srcLength;

        let tokenLength:Bignum = new Bignum(0);
        let tokens:Buffer|undefined = undefined;
        if( type == LongHeaderType.Initial ){
            // draft-13 added a token in the Initial packet, after the SCID
            // https://tools.ietf.org/html/draft-ietf-quic-transport-13#section-4.4.1
            // TODO: FIXME: actually add these to LongHeader packet, now just done for quick parsing fixing
            let oldOffset = offset;
            let tokenLengthV = VLIE.decode(buf, offset);
            tokenLength = tokenLengthV.value;
            offset = tokenLengthV.offset;
            
            if( tokenLengthV.value.toNumber() > 0 ){
                tokens = Buffer.alloc(tokenLength.toNumber());
                buf.copy(tokens, 0, offset, offset + tokenLength.toNumber());
                offset += tokenLengthV.value.toNumber();
                console.log("---------------------------------------------");
                console.log("WARNING: HeaderParser:Initial packet contained reset token, this code is not yet tested, can break! ", tokens.byteLength, tokens);
                console.log("---------------------------------------------");
            }
        }

        // a version negotation packet does NOT include packet number or payload
        // https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.3 
        // REFACTOR TODO: version neg is NOT a long header packet according to the spec, so we should switch earlier for cleanliness 
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.3
        var vlieOffset = VLIE.decode(buf, offset);
        var payloadLength = vlieOffset.value;
        var payloadLengthBuffer = Buffer.alloc(vlieOffset.offset - offset);
        buf.copy(payloadLengthBuffer, 0, offset, vlieOffset.offset);
        offset = vlieOffset.offset;
        var packetNumber = new PacketNumber(buf.slice(offset, offset + 4));
        offset += 4; // offset is now ready, right before the actual payload, which is processed elsewhere 

        var header = new LongHeader(type, destConnectionID, srcConnectionID, packetNumber, payloadLength, version, payloadLengthBuffer);
        if( tokens )
            header.setInitialTokens(tokens); // also sets initial length 

        // needed for aead encryption later
        // REF TODO 
        var parsedBuffer = buf.slice(startOffset, offset);
        header.setParsedBuffer(parsedBuffer);

        return { header: header, offset: offset };
    }

    /**
     *  https://quicwg.org/base-drafts/draft-ietf-quic-transport.html#rfc.section.4.3
        0                   1                   2                   3
        0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
        +-+-+-+-+-+-+-+-+
        |1|  Unused (7) |
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
        |                          Version (32)                         |
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
        |DCIL(4)|SCIL(4)|
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
        |               Destination Connection ID (0/32..144)         ...
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
        |                 Source Connection ID (0/32..144)            ...
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
        |                     Supported Versions (n*32)               ...
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     * @param buf 
     * @param offset 
     * @param type 
     */
    private parseVersionNegotiationHeader(buf: Buffer, offset: number, type: number): HeaderOffset {
        var conLengths = buf.readUInt8(offset++); // single byte containing both ConnectionID lengths DCIL and SCIL 
        // VERIFY TODO: connectionIDs can be empty if the other party can choose them freely
        var destLength = conLengths >> 4; // the 4 leftmost bits are the DCIL 
        destLength = destLength === 0 ? destLength : destLength + 3;
        var srcLength = conLengths & 0xF; // 0xF = 0b1111, so we keep just the 4 rightmost bits 
        srcLength = srcLength === 0 ? srcLength : srcLength + 3;

        // NOTE for above: we want to encode variable lengths for the Connection IDs of 4 to 18 bytes
        // to save space, we cram this info into 4 bits. Normally, they can only hold 0-15 as values, but because minimum length is 4, we can just do +3 to get the real value

        var destConnectionID = new ConnectionID(buf.slice(offset, offset + destLength), destLength);
        offset += destLength;
        var srcConnectionID = new ConnectionID(buf.slice(offset, offset + srcLength), srcLength);
        offset += srcLength;

        var header = new VersionNegotiationHeader(type, destConnectionID, srcConnectionID);
        return { header: header, offset: offset };
    }

    /** 
     * https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.2    
        0                   1                   2                   3
        0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
        +-+-+-+-+-+-+-+-+
        |0|K|1|1|0|R R R|
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
        |                Destination Connection ID (0..144)           ...
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
        |                      Packet Number (8/16/32)                ...
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
        |                     Protected Payload (*)                   ...
        +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+ */
    /**
     *  Method to parse the short header of a packet
     * 
     * @param buf packet buffer
     */
    private parseShortHeader(buf: Buffer, offset: number): HeaderOffset {
        var startOffset = offset; // measured in bytes

        var type = buf.readUInt8(offset++);

        var keyPhaseBit: boolean = (type & 0x40) === 0x40;    // 2nd bit, 0x40 = 0b0100 0000 // K
        // NOTE: these bits are currently just placeholders 
        var thirdBitCheck: boolean = (type & 0x20) === 0x20;  // 3rd bit, 0x20 = 0b0010 0000
        var fourthBitCheck: boolean = (type & 0x10) === 0x10; // 4th bit, 0x10 = 0b0001 0000
        var fifthBitCheck: boolean = (type & 0x08) === 0x08;  // 5th bit, 0x08 = 0b0000 1000 // google QUIC demux bit, MUST be 0 for iQUIC
        var spinBit: boolean = (type & 0x04) === 0x04;        // 6th, 7th and 8th bit reserved for experimentation 

        if (!thirdBitCheck || !fourthBitCheck || fifthBitCheck) {
            console.log("bit check failed in the first octet");
            if (thirdBitCheck)
                console.log("third bit must be 1");
            if (fourthBitCheck)
                console.log("fourth bit must be 1");
            if (!fifthBitCheck)
                console.log("fifth bit must be 0");
            //throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION)
        }


        // The destination connection ID is either length 0 or between 4 and 18 bytes long
        // There is no set way of encoding this, we are completely free to choose this ourselves.
        // This is a consequence of the split between Source and Destination Connection IDs
        // For receiving packets, we are the "destination" and we have chosen this ConnID ourselves during connection setup, so we are free to dictate its format
        // For now, we just include an 8-bit length up-front and then decode the rest based on that (see ConnectionID:randomConnectionID)
        // REFACTOR TODO: we currently do not support a 0-length connection ID with our scheme! 
        // REFACTOR TODO: use something like ConnectionID.fromBuffer() here, so that custom logic is isolated in one area 
        var destLen = buf.readUInt8(offset);
        var destConIDBuffer = Buffer.alloc(destLen);
        buf.copy(destConIDBuffer, 0, offset, offset + destLen);

        var destConnectionID = new ConnectionID(destConIDBuffer, destLen);
        offset += destLen;

        var packetNumber = new PacketNumber(buf.slice(offset, offset + 4));
        offset = offset + 4;

        var header = new ShortHeader(type, destConnectionID, packetNumber, keyPhaseBit, spinBit)
        var parsedBuffer = buf.slice(startOffset, offset);
        header.setParsedBuffer(parsedBuffer);

        return { header: header, offset: offset };
    }
}
/**
 * Interface so that the offset of the buffer is also returned because it is variable in a shortheader
 */
export interface HeaderOffset {
    header: BaseHeader,
    offset: number
}