import { BaseHeader, HeaderType } from './base.header';
import { ConnectionID, PacketNumber } from './header.properties';
import { Connection } from '../../quicker/connection';
import { Bignum } from '../../types/bignum';
import { VLIE } from '../../types/vlie';
import { VerboseLogging } from '../../utilities/logging/verbose.logging';
import { QuicError } from '../../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../../utilities/errors/quic.codes';



export class ShortHeader extends BaseHeader {
    private keyPhaseBit: boolean;
    private spinBit: boolean;
    private destConnectionID: ConnectionID;

    public constructor(destConnectionID: ConnectionID, keyPhaseBit: boolean, spinBit: boolean) {
        super(HeaderType.ShortHeader, 0);
        this.keyPhaseBit = keyPhaseBit;
        this.spinBit = spinBit;
        this.destConnectionID = destConnectionID;
    }

    public getKeyPhaseBit(): boolean {
        return this.keyPhaseBit;
    }

    public setKeyPhaseBit(bit: boolean) {
        this.keyPhaseBit = bit;
    }

    public getDestConnectionID(): ConnectionID {
        return this.destConnectionID;
    }

    public setDestConnectionID(connectionId: ConnectionID) {
        this.destConnectionID = connectionId;
    }

    public getSpinBit(): boolean {
        return this.spinBit;
    }

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

    public toUnencryptedBuffer(): Buffer {
        let size = this.getSize();
        let buffer = Buffer.alloc(size);
        let offset = 0;

        buffer.writeUInt8(this.getFirstByte(), offset++);

        let connectionID = this.getDestConnectionID();
        connectionID.toBuffer().copy(buffer, offset);
        offset += connectionID.getByteLength();

        let pn = this.getTruncatedPacketNumber()!.getValue();
        pn.toBuffer().copy(buffer, offset);

        return buffer;
    }

    // public toHeaderProtectedBuffer(connection: Connection, headerAndEncryptedPayload: Buffer): Buffer {
    //     let size = this.getSize();
    //     let buffer = Buffer.alloc(size);
    //     let offset = 0;

    //     buffer.writeUInt8(this.getFirstByte(), offset++);

    //     let connectionID = this.getDestConnectionID();
    //     connectionID.toBuffer().copy(buffer, offset);
    //     offset += connectionID.getByteLength();

    //     let pn = this.getTruncatedPacketNumber()!.getValue();
    //     let encryptedPnBuffer = connection.getAEAD().protected1RTTHeaderEncrypt(pn.toBuffer(), this, headerAndEncryptedPayload, connection.getEndpointType());
    //     encryptedPnBuffer.copy(buffer, offset);

    //     return buffer;
    // }

    private getFirstByte(): number {
        let output = 0b01000000;

        output = this.spinBit       ? output | 0x20 : output;
        output = this.keyPhaseBit   ? output | 0x04 : output;

        let pnLength = this.truncatedPacketNumber!.getValue().getByteLength(); 

        VerboseLogging.info("ShortHeader:getFirstByte : pnLength is " + pnLength + " // " + this.truncatedPacketNumber!.getValue().toNumber());
        if( pnLength > 4 ){
            VerboseLogging.error("ShortHeader:getFirstByte : packet number length is larger than 4 bytes, not supported");
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "packet number too long");
        }
        else
            output += pnLength - 1; // last two bits, so normal + is enough

        return output;
    }

    public getSize(): number {
        let size = 1 + this.getDestConnectionID().getByteLength();
        size += this.getTruncatedPacketNumber()!.getValue().getByteLength();
        return size;
    }
}