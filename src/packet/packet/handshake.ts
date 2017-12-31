import {BaseHeader} from '../header/base.header';
import {BaseFrame} from '../../frame/base.frame';
import {PacketType} from '../base.packet';
import {Connection} from '../../types/connection';
import {BaseEncryptedPacket} from './../base.encrypted.packet';


export class HandshakePacket extends BaseEncryptedPacket {
    
    public constructor(header: BaseHeader, frames: BaseFrame[]) {
        super(PacketType.Handshake,header, frames);
    }
    
    protected getEncryptedData(connection: Connection, header: BaseHeader, dataBuffer: Buffer): Buffer {
        return connection.getAEAD().clearTextEncrypt(connection, header, dataBuffer, connection.getEndpointType());
    }
}