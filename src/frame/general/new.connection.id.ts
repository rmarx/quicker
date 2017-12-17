import {ConnectionID} from '../../packet/header/base.header';
import {BaseFrame, FrameType} from '../base.frame';



export class NewConnectionIdFrame extends BaseFrame {
    private connectionID: ConnectionID;
    private statelessResetToken: Buffer;


	constructor(connectionID: ConnectionID, statelessResetToken: Buffer) {
        super(FrameType.NEW_CONNECTION_ID);
		this.connectionID = connectionID;
		this.statelessResetToken = statelessResetToken;
	}
    
}