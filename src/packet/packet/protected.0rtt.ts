import {BaseFrame, FrameType} from '../../frame/base.frame';
import {BaseHeader} from '../header/base.header';
import {PacketType} from '../base.packet';
import {Connection} from '../../quicker/connection';
import {Constants} from '../../utilities/constants';
import {PaddingFrame} from '../../frame/padding';
import {BaseEncryptedPacket} from "./../base.encrypted.packet";


export class Protected0RTTPacket extends BaseEncryptedPacket {
    
    public constructor(header: BaseHeader, frames: BaseFrame[]) {
        super(PacketType.Protected0RTT,header, frames);
    }
    
    protected getEncryptedData(connection: Connection, header: BaseHeader, dataBuffer: Buffer): Buffer {
        return connection.getAEAD().protected0RTTEncrypt(header, dataBuffer, connection.getEndpointType());
    }

    protected getValidFrameTypes(): FrameType[] {
        return [
            FrameType.STREAM, FrameType.PADDING
        ];
    }
}