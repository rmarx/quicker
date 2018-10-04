import {BaseFrame, FrameType} from '../../frame/base.frame';
import {BaseHeader} from '../header/base.header';
import {PacketType} from '../base.packet';
import {Connection} from '../../quicker/connection';
import {Constants} from '../../utilities/constants';
import {PaddingFrame} from '../../frame/padding';
import {BaseEncryptedPacket} from "./../base.encrypted.packet";


export class InitialPacket extends BaseEncryptedPacket {
    
    public constructor(header: BaseHeader, frames: BaseFrame[]) {
        super(PacketType.Initial, header, frames);
    }
    
    protected getEncryptedData(connection: Connection, header: BaseHeader, dataBuffer: Buffer): Buffer {
        return connection.getAEAD().clearTextEncrypt(connection.getInitialDestConnectionID(), header, dataBuffer, connection.getEndpointType());
    }

    protected getValidFrameTypes(): FrameType[] {
        return [
            FrameType.CRYPTO, FrameType.ACK, FrameType.PADDING
        ];
    }
}