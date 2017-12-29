import {ConnectionID} from '../../types/header.properties';
import {BaseFrame, FrameType} from '../base.frame';



export class NewConnectionIdFrame extends BaseFrame {
    private connectionID: ConnectionID;
    private statelessResetToken: Buffer;


	constructor(connectionID: ConnectionID, statelessResetToken: Buffer) {
        super(FrameType.NEW_CONNECTION_ID);
		this.connectionID = connectionID;
		this.statelessResetToken = statelessResetToken;
	}
    
    public toBuffer(): Buffer {
        var buffer = Buffer.alloc(25);
        buffer.writeUInt8(this.getType(), 0);
        this.connectionID.toBuffer().copy(buffer, 1);
        this.statelessResetToken.copy(buffer, 9);
        return buffer;
    }
}