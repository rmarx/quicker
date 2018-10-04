import {BaseHeader} from '../header/base.header';
import {BaseFrame, FrameType} from '../../frame/base.frame';
import {PacketType} from '../base.packet';
import {Connection} from '../../quicker/connection';
import {BaseEncryptedPacket} from './../base.encrypted.packet';


export class HandshakePacket extends BaseEncryptedPacket {
    
    public constructor(header: BaseHeader, frames: BaseFrame[]) {
        super(PacketType.Handshake,header, frames);
    }
    
    protected getEncryptedData(connection: Connection, header: BaseHeader, dataBuffer: Buffer): Buffer {
        return connection.getAEAD().protectedHandshakeEncrypt( header, dataBuffer, connection.getEndpointType() );
        //return connection.getAEAD().clearTextEncrypt(connection.getInitialDestConnectionID(), header, dataBuffer, connection.getEndpointType());
    }

    protected getValidFrameTypes(): FrameType[] {
        return [
            FrameType.CRYPTO, FrameType.PADDING, FrameType.ACK, FrameType.PATH_CHALLENGE, FrameType.PATH_RESPONSE, FrameType.CONNECTION_CLOSE
        ];
    }
}