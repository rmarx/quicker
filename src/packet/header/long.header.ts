import { BaseHeader, HeaderType } from "./base.header";
import { ConnectionID, PacketNumber, Version } from './header.properties';
import { Bignum } from "../../types/bignum";
import { Constants } from "../../utilities/constants";
import { VLIE } from "../../types/vlie";
import { VersionValidation } from "../../utilities/validation/version.validation";
import { Connection } from "../../quicker/connection";

export class LongHeader extends BaseHeader {
    private version: Version;
    private destConnectionID: ConnectionID;
    private srcConnectionID: ConnectionID;
    private payloadLength: Bignum;
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
    public constructor(type: number, destConnectionID: ConnectionID, srcConnectionID: ConnectionID, packetNumber: PacketNumber, payloadLength: Bignum, version: Version, payloadLengthBuffer?: Buffer) {
        super(HeaderType.LongHeader, type, packetNumber);
        this.version = version;
        this.destConnectionID = destConnectionID;
        this.srcConnectionID = srcConnectionID;
        this.payloadLength = payloadLength;
        if (payloadLengthBuffer !== undefined) {
            this.payloadLengthBuffer = payloadLengthBuffer;
        } else {
            this.payloadLengthBuffer = VLIE.encode(payloadLength);
        }

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

    // this is NOT the actual wire format: serialized version that is used for encryption calculations (e.g., associated data etc.)
    // real wire format is toPNEBuffer
    // TODO: rename these to make this kind of stuff clearer. Also find a way to de-duplicate code like this across the codebase
    public toBuffer(): Buffer {
        var buf = Buffer.alloc(this.getSize());
        var offset = 0;

        var type = 0x80 + this.getPacketType();
        buf.writeUInt8(type, offset++);

        offset += this.getVersion().toBuffer().copy(buf, offset);

        // non-zero connectionIDs are always at least 4 bytes, so we can encode their lenghts in an optimized way
        var destLength = this.destConnectionID.getLength() === 0 ? this.destConnectionID.getLength() : this.destConnectionID.getLength() - 3;
        var srcLength  = this.srcConnectionID.getLength() === 0  ? this.srcConnectionID.getLength()  : this.srcConnectionID.getLength()  - 3;
         // 0xddddssss (d = destination length, s = source length)
         buf.writeUInt8(((destLength << 4) + srcLength), offset++);

        offset += this.destConnectionID.toBuffer().copy(buf, offset);
        offset += this.srcConnectionID.toBuffer().copy(buf, offset);

        // TODO: PROPERLY add tokens here (and in toPNEBuffer?)
        if( this.getPacketType() == LongHeaderType.Initial ){
            let tokenLengthBuffer = VLIE.encode(this.initialTokenLength);
            offset += tokenLengthBuffer.copy(buf, offset);
        }
        /*
        let tokenLengthBuffer = VLIE.encode(this.initialTokenLength || new Bignum(0));
        offset += tokenLengthBuffer.copy(buf, offset);
        offset += this.initialTokens.copy(buff, offset);
        */


        var payloadLengthBuffer = VLIE.encode(this.payloadLength.add(1));
        offset += payloadLengthBuffer.copy(buf, offset);

        offset += this.getPacketNumber().getLeastSignificantBytes(1).copy(buf, offset);

        return buf; 
    }

    // for the wire format and more in-depth info, see header.parser.ts:parseLongHeader
    // this is simply the reverse of that operation 
    public toPNEBuffer(connection: Connection, payload: Buffer): Buffer {
        var buf = Buffer.alloc(this.getSize());
        var offset = 0;

        var type = 0x80 + this.getPacketType();
        buf.writeUInt8(type, offset++);

        offset += this.getVersion().toBuffer().copy(buf, offset);

        var destLength = this.destConnectionID.getLength() === 0 ? this.destConnectionID.getLength() : this.destConnectionID.getLength() - 3;
        var srcLength = this.srcConnectionID.getLength() === 0 ? this.srcConnectionID.getLength() : this.srcConnectionID.getLength() - 3;
        buf.writeUInt8(((destLength << 4) + srcLength), offset++);

        offset += this.destConnectionID.toBuffer().copy(buf, offset);
        offset += this.srcConnectionID.toBuffer().copy(buf, offset);

        // TODO: PROPERLY add tokens here
        if( this.getPacketType() == LongHeaderType.Initial ){
            let tokenLengthBuffer = VLIE.encode(this.initialTokenLength);
            offset += tokenLengthBuffer.copy(buf, offset);
        }


        var payloadLengthBuffer = VLIE.encode(this.payloadLength.add(1));
        offset += payloadLengthBuffer.copy(buf, offset);

        var pn = new Bignum(this.getPacketNumber().getLeastSignificantBytes(1));
        var encodedPn = VLIE.encodePn(pn);
        if (this.getPacketType() === LongHeaderType.Protected0RTT) {
            var pne = connection.getAEAD().protected0RTTPnEncrypt(encodedPn, this, payload, connection.getEndpointType());
        }
        else if( this.getPacketType() === LongHeaderType.Handshake ){
            var pne = connection.getAEAD().protectedHandshakePnEncrypt(encodedPn, this, payload, connection.getEndpointType()); 
        } 
        else {
            var pne = connection.getAEAD().clearTextPnEncrypt(connection.getInitialDestConnectionID(), encodedPn, this, payload, connection.getEndpointType());
        }
        offset += pne.copy(buf, offset);
        return buf;
    }

    public getSize(): number {
        // one byte for type, four bytes for version, one byte for connection ID lengths
        var size = 6;
        size += this.destConnectionID.getLength();
        size += this.srcConnectionID.getLength();
        
        if (this.getPacketNumber() === undefined) {
            size += Constants.LONG_HEADER_PACKET_NUMBER_SIZE;
        } else {
            size += this.getPacketNumberSize();
        }

        // TODO: PROPERLY add tokens here
        if( this.getPacketType() == LongHeaderType.Initial )
            size += VLIE.encode(this.initialTokenLength).byteLength;

        if (this.payloadLength !== undefined) {
            size += VLIE.encode(this.payloadLength).byteLength;
        }
        
        return size;
    }
}

// hardcoded defined at https://tools.ietf.org/html/draft-ietf-quic-transport-12#section-4.4 and 4.5 
export enum LongHeaderType {
    Initial = 0x7F,
    Retry = 0x7E,
    Handshake = 0x7D,
    Protected0RTT = 0x7C
}