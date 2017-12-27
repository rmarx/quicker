import {PacketType} from '../base.packet';
import {BaseFrame} from '../../frame/base.frame';
import {BaseHeader} from '../header/base.header';
import {Connection} from '../../quicker/connection';
import {BaseEncryptedPacket} from "./../base.encrypted.packet";


export class ShortHeaderPacket extends BaseEncryptedPacket {
    
    public constructor(header: BaseHeader, frames: BaseFrame[]) {
        super(PacketType.Protected1RTT,header, frames);
    }
    
    protected getEncryptedData(connection: Connection, header: BaseHeader, dataBuffer: Buffer): Buffer {
        return connection.getAEAD().protected1RTTEncrypt(connection, header, dataBuffer, connection.getEndpointType());
    }
}