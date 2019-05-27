import { BaseHeader, HeaderType } from "./base.header";
import { ConnectionID, PacketNumber, Version } from './header.properties';
import { Bignum } from "../../types/bignum";
import { Constants } from "../../utilities/constants";
import { VLIE } from "../../types/vlie";
import { VersionValidation } from "../../utilities/validation/version.validation";
import { Connection } from "../../quicker/connection";
import { VerboseLogging } from "../../utilities/logging/verbose.logging";
import { QuicError } from "../../utilities/errors/connection.error";
import { ConnectionErrorCodes } from "../../utilities/errors/quic.codes";

export class LongHeader extends BaseHeader {
    private version: Version;
    private destConnectionID: ConnectionID;
    private srcConnectionID: ConnectionID;
    private payloadLength: Bignum;
    // FIXME: we really want to get rid of this separate field
    // Sadly, we need this to calculate the sampleoffset in aead for header decryption
    // since it's a VLIE value, we can't just do VLIE(payloadLength), because the original value might be encoded in more bytes than was needed
    // e.g., we've seen values of 0x403d to encode 61, rather than just encoding as 0x3d directly
    // Best fix is not to calculate sampleOffset based on this, but to just use the PartiallyParsedPacket.partialHeaderLength + 4 there
    // but we can only do that after we've refactored aead.ts 
    private payloadLengthBuffer: Buffer;

    // the INITIAL packet can contain retry tokens from draft-13 onward
    private initialTokenLength:Bignum;
    private initialTokens?:Buffer;

    /**
     * 
     * @param type 
     * @param connectionID 
     * @param packetNumber 
     * @param version 
     */
    public constructor(type: number, destConnectionID: ConnectionID, srcConnectionID: ConnectionID, payloadLength: Bignum, version: Version, payloadLengthBuffer: Buffer) {
        super(HeaderType.LongHeader, type);
        this.version = version;
        this.destConnectionID = destConnectionID;
        this.srcConnectionID = srcConnectionID;
        this.payloadLength = payloadLength;
        this.payloadLengthBuffer = payloadLengthBuffer;

        this.initialTokenLength = new Bignum(0);
        this.initialTokens = undefined;
    }

    public getSrcConnectionID(): ConnectionID {
        return this.srcConnectionID;
    }

    public setSrcConnectionID(connectionId: ConnectionID) {
        this.srcConnectionID = connectionId;
    }

    public getDestConnectionID(): ConnectionID {
        return this.destConnectionID;
    }

    public setDestConnectionID(connectionId: ConnectionID) {
        this.destConnectionID = connectionId;
    }

    public getVersion(): Version {
        return this.version;
    }

    public setVersion(version: Version) {
        this.version = version;
    }

    public getPayloadLength(): Bignum {
        return this.payloadLength;
    }

    public getPayloadLengthBuffer(): Buffer {
        return this.payloadLengthBuffer;
    }

    public hasInitialTokens():boolean{
        return this.initialTokenLength.toNumber() > 0;
    }

    public getInitialTokenLength():Bignum{
        return this.initialTokenLength;
    }

    public setInitialTokens(tokens: Buffer){
        this.initialTokens = tokens;
        this.initialTokenLength = new Bignum( tokens.byteLength );
    }

    public getInitialTokens():Buffer|undefined{
        return this.initialTokens;
    }

    public setPayloadLength(value: number): void;
    public setPayloadLength(value: Bignum): void;
    public setPayloadLength(value: any): void {
        if (value instanceof Bignum) {
            this.payloadLength = value;
            return;
        }
        this.payloadLength = new Bignum(value);
        this.payloadLengthBuffer = VLIE.encode(value);
    }

    /*
    // https://tools.ietf.org/html/draft-ietf-quic-transport-20#section-17.2
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
    // TODO: find a way to de-duplicate code like this across the codebase
    public toUnencryptedBuffer(): Buffer {
        var buf = Buffer.alloc(this.getSize());
        var offset = 0;

        // draft-20
        // |1|1|T T|X X X X|
        // TT is the type, see LongHeaderType
        let firstByte = 0xC0 + (this.getPacketType() << 4); // 0xCO = 1100 0000

        // |X X X X|
        // R = reserved = must be 0
        // P = packet number length, always 2 bits, filled in later
        // initial, 0RTT, handshake: R R P P
        // retry: ODCIL 
        if( this.getPacketType() !== LongHeaderType.Retry ){
            /* packet number length, encoded
            as an unsigned, two-bit integer that is one less than the length
            of the packet number field in bytes.  That is, the length of the
            packet number field is the value of this field, plus one.  These
            bits are protected using header protection
            */
            let pnLength = this.truncatedPacketNumber!.getValue().getByteLength(); 

            VerboseLogging.info("LongHeader:toBuffer : pnLength is " + pnLength + " // " + this.truncatedPacketNumber!.getValue().toNumber());
            if( pnLength > 4 ){
                VerboseLogging.error("LongHeader:toBuffer : packet number length is larger than 4 bytes, not supported");
                throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "packet number too long");
            }
            else
                firstByte += pnLength - 1; // last two bits, so normal + is enough
        }   
        else{
            VerboseLogging.error("LongHeader:toBuffer : making a Retry packet, isn't supported yet! (ODCIL length in first byte)");
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "Retry could not be constructed");
        }

        buf.writeUInt8(firstByte, offset++);

        offset += this.getVersion().toBuffer().copy(buf, offset);

        // non-zero connectionIDs are always at least 4 bytes, so we can encode their lenghts in an optimized way
        var destLength = this.destConnectionID.getByteLength() === 0 ? this.destConnectionID.getByteLength() : this.destConnectionID.getByteLength() - 3;
        var srcLength  = this.srcConnectionID.getByteLength() === 0  ? this.srcConnectionID.getByteLength()  : this.srcConnectionID.getByteLength()  - 3;
        // 0xddddssss (d = destination length, s = source length)
        buf.writeUInt8(((destLength << 4) + srcLength), offset++);

        offset += this.destConnectionID.toBuffer().copy(buf, offset);
        offset += this.srcConnectionID.toBuffer().copy(buf, offset);

        // TODO: PROPERLY add tokens here
        if( this.getPacketType() == LongHeaderType.Initial ){
            let tokenLengthBuffer = VLIE.encode(this.initialTokenLength);
            offset += tokenLengthBuffer.copy(buf, offset);
        }
        /*
        let tokenLengthBuffer = VLIE.encode(this.initialTokenLength || new Bignum(0));
        offset += tokenLengthBuffer.copy(buf, offset);
        offset += this.initialTokens.copy(buff, offset);
        */

        let pnBuffer = this.getTruncatedPacketNumber()!.toBuffer();

        let restLengthBuffer = VLIE.encode(this.payloadLength.add(pnBuffer.byteLength));
        offset += restLengthBuffer.copy(buf, offset);

        offset += pnBuffer.copy(buf, offset);
        
        //this.getPacketNumber()!.getLeastSignificantBytes(1).copy(buf, offset);

        return buf; 
    }

    // // for the wire format and more in-depth info, see header.parser.ts:parseLongHeader
    // // this is simply the reverse of that operation 
    // public toHeaderProtectedBuffer(connection: Connection, headerAndEncryptedPayload: Buffer): Buffer {
    //     var buf = Buffer.alloc(this.getSize());
    //     var offset = 0;

    //     // draft-20 
    //     // |1|1|T T|X X X X|
    //     // TT is the type, see LongHeaderType
    //     let firstByte = 0xC0 + (this.getPacketType() << 4); // 0xCO = 1100 0000

    //     // |X X X X|
    //     // R = reserved = must be 0
    //     // P = packet number length, always 2 bits, filled in later
    //     // initial, 0RTT, handshake: R R P P
    //     // retry: ODCIL 
    //     if( this.getPacketType() !== LongHeaderType.Retry ){
    //         /* packet number length, encoded
    //         as an unsigned, two-bit integer that is one less than the length
    //         of the packet number field in bytes.  That is, the length of the
    //         packet number field is the value of this field, plus one.  These
    //         bits are protected using header protection
    //         */
    //         let pnLength = this.getTruncatedPacketNumber()!.getValue().getByteLength();
    //         VerboseLogging.info("LongHeader:toBuffer : pnLength is " + pnLength + " // " + this.getPacketNumber()!.getValue().toNumber());
    //         if( pnLength > 4 ){
    //             VerboseLogging.error("LongHeader:toBuffer : packet number length is larger than 4 bytes, not supported : " + pnLength);
    //             throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "packet number too long " + pnLength);
    //         }
    //         else
    //             firstByte += pnLength - 1; // last two bits, so normal + is enough
    //     }   
    //     else{
    //         VerboseLogging.error("LongHeader:toBuffer : making a Retry packet, isn't supported yet! (ODCIL length in first byte)");
    //         throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "Retry could not be constructed");
    //     }

    //     buf.writeUInt8(firstByte, offset++);

    //     offset += this.getVersion().toBuffer().copy(buf, offset);

    //     var destLength = this.destConnectionID.getByteLength() === 0 ? this.destConnectionID.getByteLength() : this.destConnectionID.getByteLength() - 3;
    //     var srcLength = this.srcConnectionID.getByteLength() === 0 ? this.srcConnectionID.getByteLength() : this.srcConnectionID.getByteLength() - 3;
    //     buf.writeUInt8(((destLength << 4) + srcLength), offset++);

    //     offset += this.destConnectionID.toBuffer().copy(buf, offset);
    //     offset += this.srcConnectionID.toBuffer().copy(buf, offset);

    //     // TODO: PROPERLY add tokens here
    //     if( this.getPacketType() == LongHeaderType.Initial ){
    //         let tokenLengthBuffer = VLIE.encode(this.initialTokenLength);
    //         offset += tokenLengthBuffer.copy(buf, offset);
    //     }


    //     var payloadLengthBuffer = VLIE.encode(this.payloadLength);//.add(1));
    //     offset += payloadLengthBuffer.copy(buf, offset);

    //     let encodedPn = this.getTruncatedPacketNumber()!.toBuffer();
    //     if (this.getPacketType() === LongHeaderType.Protected0RTT) {
    //         var pne = connection.getAEAD().protected0RTTHeaderEncrypt(encodedPn, this, headerAndEncryptedPayload, connection.getEndpointType());
    //     }
    //     else if( this.getPacketType() === LongHeaderType.Handshake ){
    //         var pne = connection.getAEAD().protectedHandshakeHeaderEncrypt(encodedPn, this, headerAndEncryptedPayload, connection.getEndpointType()); 
    //     } 
    //     else {
    //         var pne = connection.getAEAD().clearTextHeaderEncrypt(connection.getInitialDestConnectionID(), encodedPn, this, headerAndEncryptedPayload, connection.getEndpointType());
    //     }
    //     offset += pne.copy(buf, offset);
    //     return buf;
    // }

    public getSize(): number {
        // one byte for type, four bytes for version, one byte for connection ID lengths
        let byteSize = 6;
        byteSize += this.destConnectionID.getByteLength();
        byteSize += this.srcConnectionID.getByteLength();
        
        if (this.getPacketNumber() === undefined) {
            byteSize += Constants.LONG_HEADER_PACKET_NUMBER_SIZE;
        } else {
            byteSize += this.getTruncatedPacketNumber()!.getValue().getByteLength();
        }

        // TODO: PROPERLY add tokens here
        if( this.getPacketType() == LongHeaderType.Initial )
            byteSize += VLIE.encode(this.initialTokenLength).byteLength;

        if (this.payloadLength !== undefined) {
            byteSize += VLIE.encode(this.payloadLength).byteLength;
        }
        
        return byteSize;
    }
}

// hardcoded defined at https://tools.ietf.org/html/draft-ietf-quic-transport-20#section-17.2
export enum LongHeaderType {
    Initial         = 0x0,
    Protected0RTT   = 0x1,
    Handshake       = 0x2,
    Retry           = 0x3
}