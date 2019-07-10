import {ConnectionID} from '../packet/header/header.properties';
import {BaseFrame, FrameType} from './base.frame';
import { Bignum } from '../types/bignum';
import { VLIE } from '../types/vlie';



export class NewConnectionIdFrame extends BaseFrame {
    private sequence: Bignum;
    private connectionID: ConnectionID;
    private statelessResetToken: Buffer;


	constructor(sequence: Bignum, connectionID: ConnectionID, statelessResetToken: Buffer) {
        super(FrameType.NEW_CONNECTION_ID, true);
        this.sequence = sequence;
		this.connectionID = connectionID;
		this.statelessResetToken = statelessResetToken;
	}
    
    public toBuffer(): Buffer {
        var sequenceBuffer = VLIE.encode(this.sequence);
        var size = this.getSize(sequenceBuffer.byteLength);
        var buffer = Buffer.alloc(size);
        var offset = 0;
        buffer.writeUInt8(this.getType(), offset++);
        sequenceBuffer.copy(buffer, offset);
        offset += sequenceBuffer.byteLength;
        buffer.writeUInt8(this.connectionID.getByteLength(), offset++);
        this.connectionID.toBuffer().copy(buffer, offset);
        offset += this.connectionID.getByteLength();
        this.statelessResetToken.copy(buffer, offset);
        return buffer;
    }

    private getSize(sequenceSize: number): number {
        return this.connectionID.getByteLength() + this.statelessResetToken.length + 2 + sequenceSize;
    }

    public getConnectionId(): ConnectionID {
        return this.connectionID;
    }

    public getStatelessResetToken(): Buffer {
        return this.statelessResetToken;
    }
}